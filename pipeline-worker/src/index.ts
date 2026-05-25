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
Deepgram Aura speaks at ~2.3 words/second. Hard maximum = visualDurationSeconds x 1.8 words.

  visualDurationSeconds | max words | example
  1.5s                  | 2 words   | "Click Support..."
  2.5s                  | 4 words   | "then select the deployment..."
  3.0s                  | 5 words   | "from here, open the Logs tab..."
  4.0s                  | 7 words   | "now click Runtime Logs -- it opens instantly..."
  5.0s                  | 9 words   | "--and here, the deployment overview shows build status and aliases..."
  6.0s                  | 10 words  | "from here, select any deployment -- this opens the full build log..."
  8.0s                  | 14 words  | use \\n\\n to split into two sentences

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

**STEP CONTEXT FIELDS (use these, don't invent):**
- enrichedElementText: the specific UI label clicked. If it is null or longer than 80 chars, it is a noisy container — use pageTitle + viewportZone instead to describe what the user clicked on.
- viewportZone: spatial location of the click (e.g. "left sidebar", "top navigation bar"). Use it when enrichedElementText is unclear.
- For steps where viewportZone is "left sidebar" or "top navigation bar" with no clear enrichedElementText, write a zone-based description: e.g. "in the left sidebar, select…" or "from the top nav, click…"

**BUDGET RULE:**
For steps with visualDurationSeconds ≥ 4, use AT LEAST 60% of your word budget. Do not leave long steps with 2–4 words. Fill the time naturally with observation or context.

**YOUR TASK:**
Output ONLY valid JSON matching the schema. No preamble, no explanation, no markdown — start your response with { and end with }. Count words per step before finalizing.`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TOOLBAR_SELECTOR_PATTERNS = ['sb-toolbar', 'sb-cursor', 'sb-stop-btn', 'sb-discard-btn'];
const INTERNAL_ACTION_TYPES = ['desktop_anchor'];

const UI_CHROME_LABELS = new Set([
  'other', 'find…', 'find...', 'search', 'close', 'menu', 'back', 'forward',
  '×', '✕', 'cancel', 'ok', 'done', 'submit', 'more', 'less', 'toggle',
  'open', 'new tab', 'icon', 'logo', 'avatar',
]);

const TEST_INPUT_PATTERNS = [
  /^typing\s+(something|here|text|now)$/i,
  /^test(ing)?(\s+\d+)?$/i,
  /^(foo|bar|baz|hello|asdf|qwerty|sample|example|lorem|123|abc)$/i,
  /^[a-z]{1,4}$/i,
];

function isToolbarOrInternalStep(s: any): boolean {
  if (INTERNAL_ACTION_TYPES.includes(s.action || s.type)) return true;
  const sel = ((s.selector || s.data?.selector) || '').toLowerCase();
  return TOOLBAR_SELECTOR_PATTERNS.some(p => sel.includes(p));
}

function isBackNavigation(step: any, prevStep: any | null): boolean {
  if (!prevStep) return false;
  const prevUrl = prevStep.url || prevStep.data?.url || '';
  const currUrl = step.url || step.data?.url || '';
  if (!prevUrl || !currUrl) return false;
  try {
    const prev = new URL(prevUrl).pathname.replace(/\/$/, '');
    const curr = new URL(currUrl).pathname.replace(/\/$/, '');
    return curr !== prev && prev.startsWith(curr);
  } catch {
    return false;
  }
}

function isNoisyInput(step: any): boolean {
  const action = step.action || step.type;
  if (action !== 'input') return false;
  const coords = step.coordinates || step.data?.coordinates;
  const hasNoCoords = (coords?.x ?? 0) === 0 && (coords?.y ?? 0) === 0;
  const inputValue = step.inputValue || step.data?.inputValue;
  const isTestValue = inputValue
    ? TEST_INPUT_PATTERNS.some(p => p.test(inputValue.trim()))
    : true;
  return hasNoCoords || isTestValue;
}

function enrichElementText(s: any): string | null {
  const raw = s.elementText || s.data?.elementText;
  if (s.elementType === 'img' || s.elementRole === 'img') {
    const pageLabel = (s.pageTitle || s.data?.pageTitle || '')?.split(/[-–—]/)[0]?.trim() || '';
    return pageLabel ? `${pageLabel} link` : 'navigation link';
  }
  if (raw && UI_CHROME_LABELS.has(raw.toLowerCase())) {
    if (raw.toLowerCase().includes('find') || raw.toLowerCase().includes('search')) {
      const pageLabel = (s.pageTitle || s.data?.pageTitle || '')?.split(/[-–—]/)[0]?.trim() || 'page';
      return `search / command palette on ${pageLabel}`;
    }
    try {
      const seg = new URL(s.url || s.data?.url || '').pathname.split('/').filter(Boolean).pop() || '';
      return seg ? `navigate to ${seg}` : null;
    } catch {
      return null;
    }
  }
  if (!raw) return null;

  // Collapse whitespace and truncate noisy container text to the first meaningful line
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  // If it's a short clean label, return as-is
  if (collapsed.length <= 60) return collapsed;
  // Take the first sentence / newline-delimited chunk that is short enough
  const firstLine = collapsed.split(/[.\n]/)[0].trim();
  if (firstLine.length >= 3 && firstLine.length <= 80) return firstLine;
  // Last resort: hard-truncate at 80 chars
  return collapsed.slice(0, 80).trimEnd() + '…';
}

function viewportZone(s: any): string | null {
  const coords = s.coordinates || s.data?.coordinates;
  if (!coords) return null;
  const x = coords.x ?? 0;
  const y = coords.y ?? 0;
  const vw = coords.viewportWidth ?? 1280;
  const vh = coords.viewportHeight ?? 720;
  const xPct = x / vw;
  const yPct = y / vh;

  if (xPct < 0.12) return yPct < 0.15 ? 'top-left corner' : 'left sidebar';
  if (xPct > 0.88) return yPct < 0.15 ? 'top-right corner' : 'right sidebar';
  if (yPct < 0.12) return 'top navigation bar';
  if (yPct > 0.88) return 'bottom bar';
  return null; // main content — no zone label needed
}

// Hard post-processing word budget trimmer.
function trimToBudget(text: string, visualDurationSeconds: number): string {
  if (!text || text === '[SILENCE]') return text;
  const maxWords = Math.ceil(visualDurationSeconds * 1.8);
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  console.log(`[PIPELINE] trimToBudget: ${words.length} words -> ${maxWords} (${visualDurationSeconds}s)`);
  const trimmed = words.slice(0, maxWords).join(' ');
  const sentenceEnd = Math.max(
    trimmed.lastIndexOf('. '), trimmed.lastIndexOf('! '), trimmed.lastIndexOf('? '),
  );
  if (sentenceEnd > trimmed.length * 0.5) {
    return trimmed.slice(0, sentenceEnd + 1).trimEnd() + '...';
  }
  const clauseEnd = Math.max(trimmed.lastIndexOf(' -- '), trimmed.lastIndexOf(', '));
  if (clauseEnd > trimmed.length * 0.5) {
    return trimmed.slice(0, clauseEnd).trimEnd() + '...';
  }
  return trimmed.trimEnd().replace(/[,;:\-]+$/, '').trimEnd() + '...';
}

interface StepPayloadItem {
  id: string;
  action: string | null;
  enrichedElementText: string | null;
  elementRole: string | null;
  inputValue: string | null;
  pageTitle: string | null;
  url: string | null;
  viewportZone: string | null;
  visualDurationSeconds: number;
  isBackNavigation: boolean;
  isModalInput: boolean;
}

function buildStepPayload(
  steps: any[],
  totalRecordingMs?: number,
): { payload: StepPayloadItem[]; budgetMap: Map<string, number> } {
  const filtered = steps.filter(s => !isToolbarOrInternalStep(s));
  const budgetMap = new Map<string, number>();

  const payload = filtered.map((s, i) => {
    const isLast = i === filtered.length - 1;
    let durationSeconds = 3.0;

    if (s.timestamp != null) {
      const nextStep = filtered[i + 1];
      if (!isLast && nextStep?.timestamp != null) {
        durationSeconds = (nextStep.timestamp - s.timestamp) / 1000;
      } else if (isLast && totalRecordingMs != null) {
        // Use remaining recording time for the last step
        const firstTs = filtered[0]?.timestamp ?? s.timestamp;
        const elapsed = (s.timestamp - firstTs) / 1000;
        const remaining = totalRecordingMs / 1000 - elapsed;
        durationSeconds = Math.max(remaining, 2.0);
      }
    }

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
      id:                    s.id,
      action:                s.action || s.type || 'click',
      enrichedElementText:   enrichElementText(s),
      elementRole:           s.elementRole || s.data?.elementRole || null,
      inputValue:            noisy ? null : (s.inputValue || s.data?.inputValue || null),
      pageTitle:             s.pageTitle || s.data?.pageTitle || null,
      url:                   s.url || s.data?.url || s.data?.frameUrl || null,
      viewportZone:          viewportZone(s),
      visualDurationSeconds: Math.round(budgetSeconds * 10) / 10,
      isBackNavigation:      backNav,
      isModalInput:          noisy,
    };
  });

  return { payload, budgetMap };
}

function computeAnimationTarget(step: any) {
  const coords = step.coordinates || step.data?.coordinates;
  const vw = coords?.viewportWidth ?? 1280;
  const vh = coords?.viewportHeight ?? 720;
  const rawX = coords?.x ?? vw / 2;
  const rawY = coords?.y ?? vh / 2;
  return {
    centerX: (rawX / vw) * 100,
    centerY: (rawY / vh) * 100,
    zoomScale: 1.0,
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
      const jobType = (job as any).type ?? 'pipeline';

      if (jobType !== 'pipeline') {
        console.log(`[PIPELINE] Ignoring message of non-pipeline type:${jobType} messageId:${msg.id}`);
        msg.ack();
        continue;
      }

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

        // ── Stamp stable IDs FIRST so buildStepPayload uses them correctly ────
        steps.forEach((step, i) => {
          if (!step.id) step.id = `step-${i}`;
        });

        // ── Compute animationTarget per step (no AI needed) ───────────────────
        for (const step of steps) {
          const coords = step.coordinates || step.data?.coordinates;
          if (coords && !step.coordinates) step.coordinates = coords;
          step.animationTarget = computeAnimationTarget(step);
        }

        // ── SOP generation via Workers AI (single call) ───────────────────────
        if (steps.length > 0) {
          const totalRecordingMs = session.metadata?.durationMs || null;
          const { payload, budgetMap } = buildStepPayload(steps, totalRecordingMs ?? undefined);
          console.log(`[PIPELINE] Calling Workers AI — filtered:${payload.length}/${steps.length} steps inputChars:${JSON.stringify(payload).length}`);

          const aiResponse = await (env.AI.run as any)(
            "@cf/meta/llama-4-scout-17b-16e-instruct",
            {
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: JSON.stringify(payload) },
              ],
              guided_json: SOP_JSON_SCHEMA,
              max_tokens: 4096,
            }
          ) as { response: string | object };

          const rawResponse = aiResponse?.response;
          let generated: {
            title: string;
            summary: string;
            tags: string[];
            steps: { id: string; stepTitle: string; generatedText: string }[];
            chapterBreaks: { afterStepId: string; chapterTitle: string }[];
          };
          try {
            let rawStr = typeof rawResponse === 'string' ? rawResponse : JSON.stringify(rawResponse);

            // Strip markdown code fences if present
            rawStr = rawStr.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim();

            // Extract outermost JSON object — handles "Here is the JSON: {...}" preamble
            const firstBrace = rawStr.indexOf('{');
            const lastBrace  = rawStr.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace > firstBrace) {
              rawStr = rawStr.slice(firstBrace, lastBrace + 1);
            }

            generated = JSON.parse(rawStr) as typeof generated;
            if (!generated?.steps || !Array.isArray(generated.steps)) {
              throw new Error('AI response missing steps array');
            }
          } catch (parseErr: any) {
            console.error(`[PIPELINE] AI JSON parse failed: ${parseErr.message} | raw: ${String(rawResponse).slice(0, 400)}`);
            throw new Error(`AI returned invalid JSON: ${parseErr.message}`);
          }

          const FALLBACK_PHRASES = new Set(['completed action', 'other', 'find…', 'find...']);

          // Non-toolbar steps that were actually sent to the AI
          const filteredSteps = steps.filter(s => !isToolbarOrInternalStep(s));

          // Log what IDs the AI returned vs what we sent
          const sentIds = new Set(filteredSteps.map(s => s.id));
          const returnedIds = new Set(generated.steps.map(s => s.id));
          const idMatchCount = [...sentIds].filter(id => returnedIds.has(id)).length;
          console.log(`[PIPELINE] ID match: ${idMatchCount}/${filteredSteps.length} — AI returned IDs: ${[...returnedIds].slice(0,5).join(',')}`);

          // If the AI ignored our IDs (common), fall back to positional matching
          const usePositional = idMatchCount < Math.ceil(filteredSteps.length * 0.5);
          if (usePositional) {
            console.log('[PIPELINE] ID mismatch detected — using positional step mapping');
          }

          const processAiStep = (s: typeof generated.steps[0], originalId: string) => {
            const budget = budgetMap.get(originalId) ?? 3.0;
            let text = s.generatedText?.trim() || '[SILENCE]';
            if (FALLBACK_PHRASES.has(text.toLowerCase().replace(/\.+$/, '').trim())) text = '[SILENCE]';
            if (text !== '[SILENCE]') text = trimToBudget(text, budget);
            return { ...s, id: originalId, generatedText: text };
          };

          // Build final map keyed by original step ID
          const aiStepMap = new Map<string, { stepTitle: string; generatedText: string }>();
          if (usePositional) {
            generated.steps.forEach((s, i) => {
              const originalStep = filteredSteps[i];
              if (originalStep) aiStepMap.set(originalStep.id, processAiStep(s, originalStep.id));
            });
          } else {
            generated.steps.forEach(s => {
              aiStepMap.set(s.id, processAiStep(s, s.id));
            });
          }

          for (const step of steps) {
            const ai = aiStepMap.get(step.id);
            if (ai) {
              step.stepTitle = ai.stepTitle;
              step.generatedText = ai.generatedText;
            } else {
              step.generatedText = '[SILENCE]';
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
