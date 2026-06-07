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
  tone?: string;
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

const SYSTEM_PROMPT = `**SYSTEM ROLE:** You are an elite technical scriptwriter producing a continuous voiceover narration for a screen-recording tutorial. Your output will be read aloud by a text-to-speech voice (Deepgram Aura) -- the entire session must sound like one presenter speaking a single, flowing script.

Output fields:
- title: A clear, action-oriented title (e.g. "Navigating the Dashboard"). Do not start with "How to".
- summary: 2-3 sentences describing the goal. Write in third person.
- tags: 2-5 lowercase keywords.
- steps: For each input step produce:
    - stepTitle: A short noun phrase naming the goal of this step.
    - generatedText: The narration script. See all rules below.
- chapterBreaks: Group steps into logical workflow phases using afterStepId. STRICT RULES: (1) Never place a chapter break after step 1 or step 2. (2) Require at least 4 steps between chapter breaks. (3) Only break when the workflow phase genuinely changes (e.g. setup → configuration → launch). Fewer chapters is always better — if in doubt, omit the break. For sessions under 8 steps, 0–1 chapter breaks is appropriate.

**PUNCTUATION AS SPEECH RHYTHM:**
Deepgram Aura interprets punctuation as natural pacing. Use deliberately:
- End every narrated step with "..." so the voice trails off before the next step.
- Use " -- " (double-dash with spaces) for a mid-sentence clause break with a slight pause.
- For steps with visualDurationSeconds above 6, split into two sentences with \\n\\n for a paragraph breath.
- "," creates a micro-pause within a clause (shorter than "--").
- "?" produces rising intonation at the end -- use for observation/discovery steps.
- "!" produces emphasis -- use once per chapter maximum for a genuine reveal moment.
- Filler pauses like "--let's see," or "--now," render as natural hesitation (use sparingly, max 1 per chapter).

**CONNECTOR VARIETY (rotate these, never repeat the same one twice in a row):**
"then" / "from here" / "next" / "once there" / "going back" / "let's check" / "--and here," / "at this point" / "now" / "--now,"

**WORD BUDGET -- THIS IS A HARD LIMIT. CHECK BEFORE SUBMITTING:**
Deepgram Aura speaks at ~2.3 words/second. Hard maximum = visualDurationSeconds x 2.3 words.

  visualDurationSeconds | max words | example
  1.5s                  | 3 words   | "Click Support..."
  2.5s                  | 6 words   | "then select the deployment option..."
  3.0s                  | 7 words   | "from here, open the Logs tab..."
  4.0s                  | 9 words   | "now click Runtime Logs -- it opens instantly..."
  5.0s                  | 11 words  | "--and here, the deployment overview shows build status and aliases..."
  6.0s                  | 14 words  | "from here, select any deployment -- this opens the full build log..."
  8.0s                  | 18 words  | use \\n\\n to split into two sentences

If you write more words than the budget allows, audio will OVERRUN the video and the tutorial will break. Count your words. Cut ruthlessly.

**SILENCE RULES -- output ONLY the text "[SILENCE]" for these, no other text:**
- isBackNavigation is true: the user navigated back up the page hierarchy -- silence.
- isModalInput is true with no meaningful inputValue -- silence.
- elementRole is "svg" or "img" with no elementText and the URL has not changed from the previous step -- silence.
- Simple UI toggles, back-button clicks, closing a modal, repetitive micro-clicks -- silence.
- The step's enrichedElementText contains "(test input)" -- silence.

**TONE RULES:**
1. No "Why" Bloat: Never explain why an action exists. BAD: "Click Logs to see what happened during deployment." GOOD: "click Logs..."
2. Be Direct: Start with a verb or connector. Never use "Next you will want to" / "Now proceed to" / "In order to".
3. Discovery tone: For steps where content appears on screen (a list loads, a chart appears), end with "?" for natural rising delivery. Example: "Notice how the runtime logs stream in real time?"
4. Reveal tone: Use "!" once per chapter when something important appears. Example: "There it is -- the full build history!"
5. Grouping: If multiple rapid clicks happen under 1 second apart, summarize as one fluid sentence.

**YOUR TASK:**
Output ONLY valid JSON matching the schema. Count words per step before finalizing.`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TOOLBAR_SELECTOR_PATTERNS = ['sb-toolbar', 'sb-cursor', 'sb-stop-btn', 'sb-discard-btn'];
const INTERNAL_ACTION_TYPES = ['desktop_anchor'];

// UI chrome strings that are meaningless as narration context
const UI_CHROME_LABELS = new Set([
  'other', 'find…', 'find...', 'search', 'close', 'menu', 'back', 'forward',
  '×', '✕', 'cancel', 'ok', 'done', 'submit', 'more', 'less', 'toggle',
  'open', 'new tab', 'icon', 'logo', 'avatar',
]);

// Common test/placeholder input values that carry no semantic meaning
const TEST_INPUT_PATTERNS = [
  /^typing\s+(something|here|text|now)$/i,
  /^test(ing)?(\s+\d+)?$/i,
  /^(foo|bar|baz|hello|asdf|qwerty|sample|example|lorem|123|abc)$/i,
  /^[a-z]{1,4}$/i,
];

function isToolbarOrInternalStep(s: Step): boolean {
  if (INTERNAL_ACTION_TYPES.includes(s.action as string)) return true;
  const sel = (s.selector || '').toLowerCase();
  return TOOLBAR_SELECTOR_PATTERNS.some(p => sel.includes(p));
}

function isBackNavigation(step: Step, prevStep: Step | null): boolean {
  if (!prevStep || !step.url || !prevStep.url) return false;
  try {
    const prev = new URL(prevStep.url).pathname.replace(/\/$/, '');
    const curr = new URL(step.url).pathname.replace(/\/$/, '');
    // curr is an ancestor of prev = navigated backward up the hierarchy
    return curr !== prev && prev.startsWith(curr);
  } catch {
    return false;
  }
}

function isNoisyInput(step: Step): boolean {
  // Input inside a modal/overlay with no screen coordinates
  if (step.action !== 'input') return false;
  const hasNoCoords = (step.coordinates?.x ?? 0) === 0 && (step.coordinates?.y ?? 0) === 0;
  const isTestValue = step.inputValue
    ? TEST_INPUT_PATTERNS.some(p => p.test(step.inputValue!.trim()))
    : true; // no value = noisy
  return hasNoCoords || isTestValue;
}

function enrichElementText(s: Step): string | null {
  const raw = s.elementText;

  // Image element: alt text is usually meaningless; derive from page context instead
  if (s.elementType === 'img' || s.elementRole === 'img') {
    const pageLabel = s.pageTitle?.split(/[-–—]/)[0]?.trim() || '';
    return pageLabel ? `${pageLabel} link` : 'navigation link';
  }

  // Known UI chrome labels: infer from URL path or page context
  if (raw && UI_CHROME_LABELS.has(raw.toLowerCase())) {
    if (raw.toLowerCase().includes('find') || raw.toLowerCase().includes('search')) {
      const pageLabel = s.pageTitle?.split(/[-–—]/)[0]?.trim() || 'page';
      return `search / command palette on ${pageLabel}`;
    }
    try {
      const seg = new URL(s.url || '').pathname.split('/').filter(Boolean).pop() || '';
      return seg ? `navigate to ${seg}` : null;
    } catch {
      return null;
    }
  }

  return raw;
}

// Hard post-processing word budget trimmer.
// The AI frequently ignores the word budget instruction -- this enforces it.
function trimToBudget(text: string, visualDurationSeconds: number): string {
  if (!text || text === '[SILENCE]') return text;

  const maxWords = Math.ceil(visualDurationSeconds * 2.3);
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;

  console.log(`[PIPELINE] trimToBudget: ${words.length} words -> ${maxWords} (${visualDurationSeconds}s)`);

  const trimmed = words.slice(0, maxWords).join(' ');

  // Prefer cutting at a sentence boundary (. ! ?)
  const sentenceEnd = Math.max(
    trimmed.lastIndexOf('. '),
    trimmed.lastIndexOf('! '),
    trimmed.lastIndexOf('? '),
  );
  if (sentenceEnd > trimmed.length * 0.5) {
    return trimmed.slice(0, sentenceEnd + 1).trimEnd() + '...';
  }

  // Fall back to clause boundary (-- or ,)
  const clauseEnd = Math.max(trimmed.lastIndexOf(' -- '), trimmed.lastIndexOf(', '));
  if (clauseEnd > trimmed.length * 0.5) {
    return trimmed.slice(0, clauseEnd).trimEnd() + '...';
  }

  // Last resort: cut at word boundary
  return trimmed.trimEnd().replace(/[,;:\-]+$/, '').trimEnd() + '...';
}

interface StepPayloadItem {
  id: string;
  action: string | null | undefined;
  enrichedElementText: string | null;
  elementRole: string | null | undefined;
  inputValue: string | null | undefined;
  pageTitle: string | null | undefined;
  url: string | null | undefined;
  visualDurationSeconds: number;
  isBackNavigation: boolean;
  isModalInput: boolean;
}

function buildStepPayload(steps: Step[]): { payload: StepPayloadItem[]; budgetMap: Map<string, number> } {
  const filtered = steps.filter(s => !isToolbarOrInternalStep(s));
  const budgetMap = new Map<string, number>();

  const payload = filtered.map((s, i) => {
    let durationSeconds = 3.0;

    if (s.timestamp != null) {
      const nextStep = filtered[i + 1];
      if (nextStep?.timestamp != null) {
        durationSeconds = (nextStep.timestamp - s.timestamp) / 1000;
      }
    }

    // Tiered budget -- fast actions get tighter word budgets
    let budgetSeconds: number;
    if (durationSeconds < 0.5)      budgetSeconds = 1.5;
    else if (durationSeconds < 2.0) budgetSeconds = 2.5;
    else if (durationSeconds < 6.0) budgetSeconds = durationSeconds;
    else                            budgetSeconds = Math.min(durationSeconds, 8.0);

    budgetMap.set(s.id, budgetSeconds);

    const prevStep = i > 0 ? filtered[i - 1] : null;
    const backNav  = isBackNavigation(s, prevStep);
    const noisy    = isNoisyInput(s);

    return {
      id:                  s.id,
      action:              s.action,
      enrichedElementText: enrichElementText(s),
      elementRole:         s.elementRole,
      inputValue:          noisy ? null : s.inputValue,
      pageTitle:           s.pageTitle,
      url:                 s.url,
      visualDurationSeconds: Math.round(budgetSeconds * 10) / 10,
      isBackNavigation:    backNav,
      isModalInput:        noisy,
    };
  });

  return { payload, budgetMap };
}

// ─── Processor ───────────────────────────────────────────────────────────────

export class PipelineProcessor {
  private audit: AuditService;

  constructor(private env: Env) {
    this.audit = new AuditService(env);
  }

  async process(job: PipelineJob) {
    const { sessionId, userId, tone } = job;
    const startedAt = Date.now();

    try {
      await this.audit.record({ eventName: 'pipeline.started', userId, sessionId, properties: { ...job.requestedOutputs } });
      console.log(`[PIPELINE] Starting: ${sessionId}`);

      await this.env.DB.prepare('UPDATE sessions SET status = ?, updatedAt = ? WHERE id = ?')
        .bind('processing', startedAt, sessionId).run();

      if (!job.r2JsonKey) throw new Error('NO_R2_KEY');
      console.log(`[PIPELINE] fetching R2 object -- key:${job.r2JsonKey}`);

      const obj = await this.env.R2.get(job.r2JsonKey);
      if (!obj) throw new Error('R2_OBJECT_NOT_FOUND');

      const envelope = await obj.json() as SessionEnvelope;
      console.log(`[PIPELINE] envelope loaded -- steps:${envelope.steps?.length ?? 0} sessionType:${envelope.sessionType}`);

      // ── SOP generation ──────────────────────────────────────────────────────
      if (job.requestedOutputs?.sop !== false && envelope.steps?.length > 0) {
        const unlockedSteps = envelope.steps.filter(s => !s.locked);
        if (unlockedSteps.length === 0) {
          console.log('[PIPELINE] All steps are locked — skipping AI narration generation');
        }
        const { payload, budgetMap } = unlockedSteps.length > 0 ? buildStepPayload(unlockedSteps) : { payload: [], budgetMap: new Map() };

        if (unlockedSteps.length > 0) {
        const userMessage = JSON.stringify(payload);
        console.log(`[PIPELINE] calling Workers AI -- model:@cf/meta/llama-4-scout-17b-16e-instruct steps:${payload.length} inputChars:${userMessage.length}`);

        const toneModifier = tone
          ? `\n\n**TONE OVERRIDE:** Write all narration in a "${tone}" voice. Apply this throughout every step's generatedText.`
          : '';
        const aiResponse = await (this.env.AI.run as any)(
          '@cf/meta/llama-4-scout-17b-16e-instruct',
          {
            messages: [
              { role: 'system', content: SYSTEM_PROMPT + toneModifier },
              { role: 'user', content: userMessage },
            ],
            response_format: { type: 'json_schema', json_schema: SOP_JSON_SCHEMA },
          }
        ) as { response: string };

        const rawAiResponse = aiResponse?.response;
        console.log(`[PIPELINE] AI response received -- type:${typeof rawAiResponse} raw length:${typeof rawAiResponse === 'string' ? rawAiResponse.length : 'object'}`);
        console.log(`[PIPELINE] AI raw response:`, typeof rawAiResponse === 'string' ? rawAiResponse.slice(0, 300) : JSON.stringify(rawAiResponse).slice(0, 300));

        if (!rawAiResponse) {
          throw new Error(`AI_NULL_RESPONSE: model returned ${JSON.stringify(aiResponse)}`);
        }

        // Workers AI sometimes auto-parses the JSON when using json_schema response_format
        const generated = (typeof rawAiResponse === 'object' ? rawAiResponse : JSON.parse(rawAiResponse as string)) as {
          title: string;
          summary: string;
          tags: string[];
          steps: { id: string; stepTitle: string; generatedText: string }[];
          chapterBreaks: { afterStepId: string; chapterTitle: string }[];
        };

        // Post-process: enforce word budget and sanitize fallback phrases
        const FALLBACK_PHRASES = new Set(['completed action', 'other', 'find…', 'find...']);

        const aiStepMap = new Map(generated.steps.map(s => {
          const budget = budgetMap.get(s.id) ?? 3.0;
          let text = s.generatedText?.trim() || '[SILENCE]';

          // Suppress AI fallback echoes
          if (FALLBACK_PHRASES.has(text.toLowerCase().replace(/\.+$/, '').trim())) {
            text = '[SILENCE]';
          }

          // Enforce hard word budget
          if (text !== '[SILENCE]') {
            text = trimToBudget(text, budget);
          }

          return [s.id, { ...s, generatedText: text }];
        }));

        envelope.steps = envelope.steps.map(step => ({
          ...step,
          stepTitle:     aiStepMap.get(step.id)?.stepTitle     ?? step.stepTitle     ?? null,
          generatedText: aiStepMap.get(step.id)?.generatedText ?? step.generatedText,
        }));

        envelope.aiOutputs = {
          title:   generated.title,
          summary: generated.summary,
          tags:    generated.tags,
        };

        envelope.metadata = {
          ...envelope.metadata,
          chapterBreaks: generated.chapterBreaks,
        };

        console.log(`[PIPELINE] AI generated title: "${generated.title}" for ${sessionId}`);
        } // end if (unlockedSteps.length > 0)
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
