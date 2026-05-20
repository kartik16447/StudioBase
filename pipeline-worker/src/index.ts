import type { SessionEnvelope } from "../../shared/types/session";
import { AuditService } from "./services/AuditService";

interface Env {
  AI: Ai;
  R2: R2Bucket;
  DB: D1Database;
  ANALYTICS: AnalyticsEngineDataset;
}

interface PipelineMessage {
  sessionId: string;
  userId: string;
  r2JsonKey: string;
  workspaceId?: string;
  requestedOutputs?: {
    sop?: boolean;
    demo?: boolean;
    video?: boolean;
  };
}

// ─── AI response schema ───────────────────────────────────────────────────────

const SOP_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          stepTitle: { type: "string" },
          generatedText: { type: "string" },
        },
        required: ["id", "stepTitle", "generatedText"],
      },
    },
    chapterBreaks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          afterStepId: { type: "string" },
          chapterTitle: { type: "string" },
        },
        required: ["afterStepId", "chapterTitle"],
      },
    },
  },
  required: ["title", "summary", "tags", "steps", "chapterBreaks"],
};

const SYSTEM_PROMPT = `You are an expert SOP (Standard Operating Procedure) writer. Given a sequence of raw user actions from a screen recording session, produce polished, professional documentation that a new employee could follow without any technical knowledge.

Output fields:
- title: A clear, action-oriented title describing the overall goal (e.g. "Navigating and Opening Documents in the Application"). Do not start with "How to".
- summary: 2–3 sentences describing what this procedure accomplishes, when someone would use it, and what they will achieve by the end. Write in third person (e.g. "This process walks you through...").
- tags: 2–5 lowercase keywords relevant to the workflow domain.
- steps: For each input step produce:
    - stepTitle: A short noun phrase naming the goal of this step (e.g. "Open the Main Application Screen", "Locate the Primary Navigation Area"). Capitalize each word. Do not include a step number.
    - generatedText: 1–3 sentences describing what the user does and WHY — focus on the user's intent and what they are accomplishing, not the raw mechanics. Write in second person imperative (e.g. "Begin by navigating to the main application screen where your work area and options are displayed."). If the action involves a form field or input, mention what value was entered and why.
- chapterBreaks: Group steps into 2–5 logical workflow phases. afterStepId must be an id from the input. Place breaks at natural transitions between distinct stages of the workflow.

Critical rules:
- Every step id must be preserved exactly as given — do not add, remove, or rename any.
- Do NOT mention raw technical details like CSS selectors, DOM roles, or coordinates.
- Write as if explaining to a non-technical new hire. Avoid jargon.
- Output valid JSON only — no markdown fences, no commentary.`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildStepPayload(steps: any[]) {
  return steps.map((s, i) => ({
    id: s.id || `step-${i}`,
    action: s.action || s.type || "click",
    elementText: s.elementText || s.data?.elementText || null,
    elementRole: s.elementRole || s.data?.elementRole || null,
    inputValue: s.inputValue || s.data?.inputValue || null,
    pageTitle: s.pageTitle || s.data?.pageTitle || "",
    url: s.url || s.data?.url || s.data?.frameUrl || "",
    selector: s.selector || s.data?.selector || null,
  }));
}

function computeAnimationTarget(step: any) {
  const vw = step.coordinates?.viewportWidth ?? 1280;
  const vh = step.coordinates?.viewportHeight ?? 720;
  const rawX = step.coordinates?.x ?? vw / 2;
  const rawY = step.coordinates?.y ?? vh / 2;
  return {
    centerX: (rawX / vw) * 100,
    centerY: (rawY / vh) * 100,
    zoomScale: 2.5,
    transitionType: "fade",
    transitionDurationMs: 400,
  };
}

// ─── Queue handler ────────────────────────────────────────────────────────────

export default {
  async queue(batch: MessageBatch<PipelineMessage>, env: Env): Promise<void> {
    const audit = new AuditService(env);

    for (const msg of batch.messages) {
      const job = msg.body;
      const startTime = Date.now();

      console.log(`[PIPELINE] Starting — sessionId:${job.sessionId} r2Key:${job.r2JsonKey}`);

      try {
        await audit.record({
          eventName: "pipeline.started",
          userId: job.userId,
          sessionId: job.sessionId,
          properties: { ...job.requestedOutputs },
        });

        await env.DB.prepare("UPDATE sessions SET status = ?, updatedAt = ? WHERE id = ?")
          .bind("processing", Date.now(), job.sessionId)
          .run();

        // ── Load session from R2 ──────────────────────────────────────────────
        const obj = await env.R2.get(job.r2JsonKey);
        if (!obj) throw new Error(`R2 key not found: ${job.r2JsonKey}`);
        const session = await obj.json() as SessionEnvelope;

        // Normalise: extension may upload events instead of steps
        const steps: any[] = (session as any).steps ?? (session as any).events ?? [];
        if (!(session as any).steps) (session as any).steps = steps;

        console.log(`[PIPELINE] Loaded session — steps:${steps.length} sessionType:${(session as any).sessionType}`);

        // ── Compute animationTarget per step (no AI needed) ───────────────────
        for (const step of steps) {
          const coords = step.coordinates || step.data?.coordinates;
          if (coords && !step.coordinates) step.coordinates = coords;
          step.animationTarget = computeAnimationTarget(step);
        }

        // ── SOP generation via Workers AI (single call) ───────────────────────
        if (steps.length > 0) {
          const payload = buildStepPayload(steps);
          console.log(`[PIPELINE] Calling Workers AI — steps:${steps.length} inputChars:${JSON.stringify(payload).length}`);

          const aiResponse = await (env.AI.run as any)(
            "@cf/meta/llama-4-scout-17b-16e-instruct",
            {
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: JSON.stringify(payload) },
              ],
              response_format: { type: "json_schema", json_schema: SOP_JSON_SCHEMA },
              max_tokens: 8192,
            }
          ) as { response: string | object };

          const rawResponse = aiResponse?.response;
          const generated = (typeof rawResponse === 'string' ? JSON.parse(rawResponse) : rawResponse) as {
            title: string;
            summary: string;
            tags: string[];
            steps: { id: string; stepTitle: string; generatedText: string }[];
            chapterBreaks: { afterStepId: string; chapterTitle: string }[];
          };

          const aiStepMap = new Map(generated.steps.map((s) => [s.id, s]));

          // Stamp stable IDs onto step objects (same index-based fallback as buildStepPayload)
          // so R2 always has steps with proper id fields.
          steps.forEach((step, i) => {
            if (!step.id) step.id = `step-${i}`;
          });

          for (const step of steps) {
            const ai = aiStepMap.get(step.id);
            if (ai) {
              step.stepTitle = ai.stepTitle;
              step.generatedText = ai.generatedText;
            } else {
              step.generatedText = step.generatedText || step.elementText || step.data?.elementText || "Completed action";
            }
          }

          session.aiOutputs = {
            title: generated.title,
            summary: generated.summary,
            tags: generated.tags,
          };

          session.metadata = {
            ...(session.metadata ?? {}),
            stepCount: steps.length,
            durationMs: session.metadata?.durationMs ?? 0,
            chapterBreaks: generated.chapterBreaks,
          };

          console.log(`[PIPELINE] Generated title: "${generated.title}"`);
        }

        // ── Write enriched session back to R2 ─────────────────────────────────
        await env.R2.put(job.r2JsonKey, JSON.stringify(session), {
          httpMetadata: { contentType: "application/json" },
        });

        // ── Mark session ready in D1 ──────────────────────────────────────────
        await env.DB.prepare("UPDATE sessions SET status = ?, pipelinePath = ?, updatedAt = ? WHERE id = ?")
          .bind("ready", "cloud", Date.now(), job.sessionId)
          .run();

        await audit.record({
          eventName: "pipeline.completed",
          userId: job.userId,
          sessionId: job.sessionId,
          properties: { durationMs: Date.now() - startTime },
        });

        console.log(`[PIPELINE] Done — sessionId:${job.sessionId} durationMs:${Date.now() - startTime}`);
        msg.ack();

      } catch (err: any) {
        console.error(`[PIPELINE] Failed — sessionId:${job.sessionId} error:${err.message}`);

        await env.DB.prepare("UPDATE sessions SET status = ?, errorReason = ?, updatedAt = ? WHERE id = ?")
          .bind("failed", err.message, Date.now(), job.sessionId)
          .run();

        await audit.record({
          eventName: "pipeline.failed",
          userId: job.userId,
          sessionId: job.sessionId,
          properties: { error: err.message },
        });

        if (msg.attempts >= 3) {
          console.error(`[PIPELINE] Max retries reached — acking to remove from queue`);
          msg.ack();
        } else {
          msg.retry();
        }
      }
    }
  },
};
