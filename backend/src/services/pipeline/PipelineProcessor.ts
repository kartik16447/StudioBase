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

const SYSTEM_PROMPT = `You are an expert SOP (Standard Operating Procedure) writer. Given a sequence of raw user actions from a screen recording session, produce polished, professional documentation that a new employee could follow without any technical knowledge.

Output fields:
- title: A clear, action-oriented title describing the overall goal (e.g. "Navigating and Opening Documents in the Application"). Do not start with "How to".
- summary: 2–3 sentences describing what this procedure accomplishes, when someone would use it, and what they will achieve by the end. Write in third person (e.g. "This process walks you through...").
- tags: 2–5 lowercase keywords relevant to the workflow domain.
- steps: For each input step produce:
    - stepTitle: A short noun phrase naming the goal of this step (e.g. "Open the Main Application Screen", "Locate the Primary Navigation Area"). Capitalize each word. Do not include a step number.
    - generatedText: The narration script for this step. Write in second person imperative (e.g. "Click the Billing tab"). If the action involves a form field or input, mention what value was entered and why.
- chapterBreaks: Group steps into 2–5 logical workflow phases. afterStepId must be an id from the input. Place breaks at natural transitions between distinct stages of the workflow.

Critical rules:
- Every step id must be preserved exactly as given — do not add, remove, or rename any.
- Do NOT mention raw technical details like CSS selectors, DOM roles, or coordinates.
- Write as if explaining to a non-technical new hire. Avoid jargon.
- STRICT TEMPORAL BUDGETING: The input JSON provides a \`visualDurationSeconds\` for each step. The video for this step will last EXACTLY this long. You must constrain the length of \`generatedText\` so it can be spoken aloud within this time limit (assume a maximum of 2 words per second).
- STYLISTIC CONSTRAINT: Write in punchy, direct fragments. Do not use filler words. Say "Click the Billing tab" instead of "Now you will want to go ahead and click the Billing tab". Keep the word count strictly under (visualDurationSeconds * 2).
- Output valid JSON only — no markdown fences, no commentary.`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildStepPayload(steps: Step[]) {
  return steps.map((s, i) => {
    let durationSeconds = 3.0; // fallback default
    
    if (s.timestamp !== undefined && s.timestamp !== null) {
      const nextStep = steps[i + 1];
      if (nextStep && nextStep.timestamp !== undefined && nextStep.timestamp !== null) {
        durationSeconds = (nextStep.timestamp - s.timestamp) / 1000;
      }
    }
    
    // Enforce minimum budget floor for micro-actions (e.g. fast clicks)
    const budgetSeconds = Math.max(durationSeconds, 3.0);

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
