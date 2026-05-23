import { Env } from '../../types/hono';
import { AuditService } from '../AuditService';
import type { Step } from '../../../../shared/types/step';
import type { SessionEnvelope } from '../../../../shared/types/session';

export interface PipelineJob {
  sessionId: string;
  userId: string;
  r2JsonKey?: string;
  requestedOutputs?: {
    sop?: boolean;
    demo?: boolean;
    video?: boolean;
  };
}

// ─── AI response schema ───────────────────────────────────────────────────────

const SOP_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          stepTitle: { type: 'string' },
          generatedText: { type: 'string' },
        },
        required: ['id', 'stepTitle', 'generatedText'],
      },
    },
    chapterBreaks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          afterStepId: { type: 'string' },
          chapterTitle: { type: 'string' },
        },
        required: ['afterStepId', 'chapterTitle'],
      },
    },
  },
  required: ['title', 'summary', 'tags', 'steps', 'chapterBreaks'],
};

const SYSTEM_PROMPT = `**SYSTEM ROLE:** You are an elite technical scriptwriter producing a continuous voiceover narration for a screen-recording tutorial. Your output will be read aloud by a text-to-speech voice — the entire session must sound like one presenter speaking a single, flowing script, not a list of disconnected instructions.

Output fields:
- title: A clear, action-oriented title (e.g. "Navigating the Dashboard"). Do not start with "How to".
- summary: 2–3 sentences describing the goal. Write in third person.
- tags: 2–5 lowercase keywords.
- steps: For each input step produce:
    - stepTitle: A short noun phrase naming the goal of this step.
    - generatedText: The narration script for this step. See rules below.
- chapterBreaks: Group steps into logical workflow phases using afterStepId.

**NARRATION STYLE — ONE CONTINUOUS SCRIPT:**
Write all \`generatedText\` fields as beats in a single flowing voiceover. The TTS engine (Deepgram Aura) interprets punctuation as natural speech rhythm — use this deliberately:

- End EVERY step's narration with \`...\` so the voice trails off naturally before the next step begins.
- Use \` — \` (em-dash with spaces) for a mid-sentence clause break when you want a slight pause within a sentence.
- For steps with \`visualDurationSeconds\` above 6, split into two sentences with \`\\n\\n\` between them to create a natural paragraph breath.
- Start steps 2 onward with a light connector word — "then", "from here", "next", "once there" — so consecutive clips sound linked when played back.

**WORD BUDGET:**
Each step has a \`visualDurationSeconds\` field. Target \`visualDurationSeconds × 1.4\` words — comfortable speaking pace, never rushed. Hard maximum: \`visualDurationSeconds × 1.8\` words. Never exceed this.

**THE RULES OF NARRATION:**
1. **No "Why" Bloat:** Do not explain obvious concepts or add motivation.
   - BAD: "Click on 'Support' to discover available resources for troubleshooting and assistance."
   - GOOD: "Click Support..."
2. **Be Direct:** Start with the verb or a connector word. Never use filler like "Next you will want to," "Now," or "Proceed to."
3. **The Silence Rule:** If the action is a simple UI toggle, a browser back-button, turning off a pointer or cursor tool, or a repetitive click that adds no value — output exactly: \`[SILENCE]\`. No other text.
4. **Grouping:** If given multiple rapid clicks in a row (under 1 second apart), summarize them as one fluid sentence ending with \`...\`.

**EXAMPLE OUTPUT for 3 consecutive steps:**
- Step 1 generatedText: "Open the dashboard toolbar to access your workspace features..."
- Step 2 generatedText: "then use Spotlight — the quick-launch menu — to jump between sections..."
- Step 3 generatedText: "from here, select your project\\n\\nThis opens the full deployment history and live status..."

**YOUR TASK:**
Output ONLY valid JSON matching the schema.`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TOOLBAR_SELECTOR_PATTERNS = ['sb-toolbar', 'sb-cursor', 'sb-stop-btn', 'sb-discard-btn'];
const INTERNAL_ACTION_TYPES = ['desktop_anchor'];

function isToolbarOrInternalStep(s: Step): boolean {
  if (INTERNAL_ACTION_TYPES.includes(s.action as string)) return true;
  const sel = (s.selector || '').toLowerCase();
  return TOOLBAR_SELECTOR_PATTERNS.some(p => sel.includes(p));
}

function buildStepPayload(steps: Step[]) {
  // Filter out toolbar/internal events before sending to AI
  const filtered = steps.filter(s => !isToolbarOrInternalStep(s));

  return filtered.map((s, i) => {
    let durationSeconds = 3.0; // fallback default

    if (s.timestamp != null) {
      const nextStep = filtered[i + 1];
      if (nextStep?.timestamp != null) {
        durationSeconds = (nextStep.timestamp - s.timestamp) / 1000;
      }
    }

    // Tiered psychological budget — fast actions get tighter budgets
    let budgetSeconds: number;
    if (durationSeconds < 0.5)       budgetSeconds = 1.5;  // micro-click: 2–3 words max
    else if (durationSeconds < 2.0)  budgetSeconds = 2.5;  // fast action: short sentence
    else if (durationSeconds < 6.0)  budgetSeconds = durationSeconds; // natural pace
    else                             budgetSeconds = Math.min(durationSeconds, 8.0); // cap long pauses

    return {
      id: s.id,
      action: s.action,
      elementText: s.elementText,
      elementRole: s.elementRole,
      inputValue: s.inputValue,
      pageTitle: s.pageTitle,
      url: s.url,
      selector: s.selector,
      visualDurationSeconds: Math.round(budgetSeconds * 10) / 10,
    };
  });
}

// ─── Processor ───────────────────────────────────────────────────────────────

export class PipelineProcessor {
  private audit: AuditService;

  constructor(private env: Env) {
    this.audit = new AuditService(env);
  }

  async process(job: PipelineJob) {
    const { sessionId, userId } = job;
    const startedAt = Date.now();

    try {
      await this.audit.record({ eventName: 'pipeline.started', userId, sessionId, properties: { ...job.requestedOutputs } });
      console.log(`[PIPELINE] Starting: ${sessionId}`);

      await this.env.DB.prepare('UPDATE sessions SET status = ?, updatedAt = ? WHERE id = ?')
        .bind('processing', startedAt, sessionId).run();

      if (!job.r2JsonKey) throw new Error('NO_R2_KEY');
      console.log(`[PIPELINE] fetching R2 object — key:${job.r2JsonKey}`);

      const obj = await this.env.R2.get(job.r2JsonKey);
      if (!obj) throw new Error('R2_OBJECT_NOT_FOUND');

      const envelope = await obj.json() as SessionEnvelope;
      console.log(`[PIPELINE] envelope loaded — steps:${envelope.steps?.length ?? 0} sessionType:${envelope.sessionType}`);

      // ── SOP generation ──────────────────────────────────────────────────────
      if (job.requestedOutputs?.sop !== false && envelope.steps?.length > 0) {
        const userMessage = JSON.stringify(buildStepPayload(envelope.steps));
        console.log(`[PIPELINE] calling Workers AI — model:@cf/meta/llama-4-scout-17b-16e-instruct steps:${envelope.steps.length} inputChars:${userMessage.length}`);

        const aiResponse = await (this.env.AI.run as any)(
          '@cf/meta/llama-4-scout-17b-16e-instruct',
          {
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userMessage },
            ],
            response_format: { type: 'json_schema', json_schema: SOP_JSON_SCHEMA },
          }
        ) as { response: string };

        console.log(`[PIPELINE] AI response received — raw length:${aiResponse?.response?.length ?? 0}`);
        console.log(`[PIPELINE] AI raw response:`, aiResponse?.response?.slice(0, 300));
        const generated = JSON.parse(aiResponse.response) as {
          title: string;
          summary: string;
          tags: string[];
          steps: { id: string; stepTitle: string; generatedText: string }[];
          chapterBreaks: { afterStepId: string; chapterTitle: string }[];
        };

        const aiStepMap = new Map(generated.steps.map(s => [s.id, s]));
        envelope.steps = envelope.steps.map(step => ({
          ...step,
          stepTitle: aiStepMap.get(step.id)?.stepTitle ?? step.stepTitle ?? null,
          generatedText: aiStepMap.get(step.id)?.generatedText ?? step.generatedText,
        }));

        envelope.aiOutputs = {
          title: generated.title,
          summary: generated.summary,
          tags: generated.tags,
        };

        envelope.metadata = {
          ...envelope.metadata,
          chapterBreaks: generated.chapterBreaks,
        };

        console.log(`[PIPELINE] AI generated title: "${generated.title}" for ${sessionId}`);
      }

      envelope.metadata = envelope.metadata ?? {};
      (envelope.metadata as any).processedAt = Date.now();

      await this.env.R2.put(job.r2JsonKey, JSON.stringify(envelope), {
        httpMetadata: { contentType: 'application/json' },
      });

      await this.env.DB.prepare('UPDATE sessions SET status = ?, pipelinePath = ?, updatedAt = ? WHERE id = ?')
        .bind('ready', 'cloud', Date.now(), sessionId).run();

      await this.audit.record({ eventName: 'pipeline.completed', userId, sessionId, properties: { durationMs: Date.now() - startedAt } });
      console.log(`[PIPELINE] Done: ${sessionId}`);

    } catch (err: any) {
      console.error(`[PIPELINE] Failed for ${sessionId}:`, err.message);

      await this.env.DB.prepare('UPDATE sessions SET status = ?, errorReason = ?, updatedAt = ? WHERE id = ?')
        .bind('failed', err.message, Date.now(), sessionId).run();

      await this.audit.record({ eventName: 'pipeline.failed', userId, sessionId, properties: { error: err.message } });

      throw err;
    }
  }
}
