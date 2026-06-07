import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { authMiddleware } from '../../middlewares/auth';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getWorkspaceCredits, creditDeductStatements, creditRefundStatements, checkLowCreditNotify } from '../../services/CreditService';

const steps = new Hono<{ Bindings: Env; Variables: Variables }>();

// Audio routes only need authentication — workspace lookup is done inside
// requireSession via the session's own workspaceId column, so the client
// doesn't need to pass a workspaceId (avoids mismatch 404s).
steps.use('*', authMiddleware());

const GenerateAudioSchema = z.object({
  text: z.string().min(1).max(5000),
  language: z.string().optional(),
});

const PatchDurationSchema = z.object({
  durationMs: z.number().int().positive(),
});

const SwapVoiceSchema = z.object({
  voiceId: z.string().min(1).max(255),
});

const GenerateScriptSchema = z.object({
  visualDurationSeconds: z.number().positive(),
  customInstruction: z.string().optional(),
});

const AUDIO_TTS_CREDIT_COST = 1;
const AUDIO_SWAP_CREDIT_COST = 1;
const STUCK_JOB_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Verify the session exists and the requesting user owns it (or is a workspace member).
 * Returns the session row including its workspaceId — callers use that for credits/ledger.
 */
async function requireSession(env: Env, sessionId: string, userId: string) {
  const session = await env.DB.prepare(
    `SELECT s.id, s.ownerId, s.workspaceId
     FROM sessions s
     WHERE s.id = ?
       AND s.deletedAt IS NULL
       AND (
         s.ownerId = ?
         OR EXISTS (
           SELECT 1 FROM workspace_members wm
           WHERE wm.workspaceId = s.workspaceId AND wm.userId = ?
         )
       )`
  ).bind(sessionId, userId, userId).first() as { id: string; ownerId: string; workspaceId: string } | null;
  if (!session) throw new HTTPException(404, { message: 'Session not found or access denied' });
  return session;
}

// ─── POST generate-script ────────────────────────────────────────────────────

steps.post('/:sessionId/steps/:stepId/generate-script',
  zValidator('json', GenerateScriptSchema),
  async (c) => {
    const user = c.get('user');
    const { sessionId, stepId } = c.req.param();
    const { visualDurationSeconds, customInstruction } = c.req.valid('json');

    console.log(`[generate-script] Request received: sessionId=${sessionId}, stepId=${stepId}, visualDurationSeconds=${visualDurationSeconds}, userId=${user.id}`);

    await requireSession(c.env, sessionId, user.id);

    // Get the step content from R2 session.json
    const assetKey = `sessions/${sessionId}/session.json`;
    const assetObj = await c.env.R2.get(assetKey);
    if (!assetObj) {
      console.warn(`[generate-script] Session asset not found in R2: ${assetKey}`);
      throw new HTTPException(404, { message: 'Session asset not found' });
    }

    let envelope: any;
    try {
      envelope = JSON.parse(await assetObj.text());
    } catch (parseErr) {
      console.error(`[generate-script] Failed to parse session JSON:`, parseErr);
      throw new HTTPException(500, { message: 'Invalid session data' });
    }

    const stepData = envelope.steps?.find((s: any) => s.id === stepId);
    if (!stepData) {
      console.warn(`[generate-script] Step not found in session JSON: stepId=${stepId}`);
      throw new HTTPException(404, { message: 'Step not found' });
    }



    const budgetSeconds = Math.max(visualDurationSeconds, 5.0);
    console.log(`[generate-script] Step action details: action=${stepData.action}, pageTitle=${stepData.pageTitle}. Adjusted budget: ${budgetSeconds}s (visual duration was ${visualDurationSeconds}s)`);

    const SYSTEM_PROMPT = `
You are an expert technical writer crafting a voiceover script for a software tutorial video.

**THE CONSTRAINTS:**
You are given a UI action and a time budget (\`visualDurationSeconds\`). Minimum budget is 5.0s (≈12 words).
Average speaking rate is 2.5 words per second.
- You MUST NEVER exceed \`visualDurationSeconds * 2.5\` words.
- Minimum 10 words — every step deserves a complete, natural sentence.

**THE RULES OF NARRATION:**
1. **Use Exact Context:** ALWAYS use the \`elementText\`, \`pageTitle\`, or \`inputValue\` provided in the payload to describe what is being interacted with. NEVER invent button names (e.g. do not say "Click Save" unless the element text actually says "Save").
2. **Be Direct but Natural:** You may use light transitional words (e.g., "Now," "Next,") if it makes the narration flow better, but prioritize brevity.
3. **No "Why" Bloat:** Do not over-explain obvious concepts or read out long sentences.
   - BAD: "Click on 'Support' to discover available resources for troubleshooting and assistance."
   - GOOD: "Click Support." or "Next, open the Support tab."

**YOUR TASK:**
Given the UI Action and Time Budget, generate the final spoken script. Output valid JSON with a single "generatedText" field containing ONLY the spoken text. Do not include conversational filler in the generated text.`;

    const userMessage = JSON.stringify({
      action: stepData.action,
      elementText: stepData.elementText,
      elementRole: stepData.elementRole,
      inputValue: stepData.inputValue,
      pageTitle: stepData.pageTitle,
      visualDurationSeconds: budgetSeconds,
      customInstruction: customInstruction || undefined
    });

    console.log(`[generate-script] Invoking LLM @cf/meta/llama-4-scout-17b-16e-instruct`);
    const aiResponse = await (c.env.AI.run as any)(
      '@cf/meta/llama-4-scout-17b-16e-instruct',
      {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        response_format: { 
          type: 'json_schema', 
          json_schema: {
            type: 'object',
            properties: { generatedText: { type: 'string' } },
            required: ['generatedText']
          }
        },
      }
    ) as { response: string };

    console.log(`[generate-script] LLM raw response length: ${aiResponse?.response?.length ?? 0}`);

    let generatedText = '';
    let rawResponse: any = '';
    try {
      // Sometimes Cloudflare AI auto-parses the JSON response when using json_schema
      if (aiResponse?.response && typeof aiResponse.response === 'object') {
        generatedText = (aiResponse.response as any).generatedText;
        if (!generatedText) {
          throw new Error('generatedText key missing from pre-parsed JSON response');
        }
      } else {
        if (typeof aiResponse === 'string') {
          rawResponse = aiResponse;
        } else if (aiResponse?.response) {
          rawResponse = aiResponse.response;
        } else if ((aiResponse as any)?.choices?.[0]?.message?.content) {
          rawResponse = (aiResponse as any).choices[0].message.content;
        } else {
          rawResponse = JSON.stringify(aiResponse);
        }
        
        // Ensure rawResponse is a string before calling string methods
        if (typeof rawResponse !== 'string') {
          rawResponse = JSON.stringify(rawResponse);
        }
        
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON object found in response string');
        }
        
        const parsed = JSON.parse(jsonMatch[0]);
        generatedText = parsed.generatedText;
        
        if (!generatedText && generatedText !== '') {
           throw new Error('generatedText key missing from JSON');
        }
      }

      // If the model explicitly decided on silence, convert it to an empty string 
      // so the UI correctly shows the empty state placeholder instead of literal text.
      if (generatedText.trim().toUpperCase() === '[SILENCE]') {
        generatedText = '';
      }

      console.log(`[generate-script] Parsed generatedText: "${generatedText}"`);
    } catch (e: any) {
      const rawString = typeof rawResponse === 'string' ? rawResponse : JSON.stringify(rawResponse);
      console.error(`[generate-script] Failed to extract LLM response: "${rawString}"`, e);
      throw new HTTPException(500, { message: `Failed to parse AI response: ${e.message}. Raw: ${rawString.substring(0, 50)}...` });
    }

    // Update the step in the R2 session JSON envelope
    stepData.generatedText = generatedText;
    
    console.log(`[generate-script] Updating R2 session.json record for stepId=${stepId}`);
    await c.env.R2.put(assetKey, JSON.stringify(envelope), {
      httpMetadata: { contentType: 'application/json' },
    });

    console.log(`[generate-script] Successfully updated stepId=${stepId}. Returning text.`);
    return c.json({ generatedText, budgetSeconds });
  }
);

// ─── POST generate-audio ─────────────────────────────────────────────────────

steps.post('/:sessionId/steps/:stepId/generate-audio',
  zValidator('json', GenerateAudioSchema),
  async (c) => {
    const user = c.get('user');
    const { sessionId, stepId } = c.req.param();
    const { text, language } = c.req.valid('json');

    console.log(`[generate-audio] Request received: sessionId=${sessionId}, stepId=${stepId}, language=${language}`);
    console.log(`[generate-audio] Text to process (length ${text?.length ?? 0}): "${text?.substring(0, 80)}..."`);

    const session = await requireSession(c.env, sessionId, user.id);
    const workspaceId = session.workspaceId;

    // Reject if already generating (avoid duplicate charges)
    const existing = await c.env.DB.prepare(
      'SELECT voiceoverSource FROM step_audio WHERE stepId = ? AND sessionId = ?'
    ).bind(stepId, sessionId).first() as any;

    if (existing?.voiceoverSource === 'generating') {
      throw new HTTPException(409, { message: 'Audio generation already in progress for this step' });
    }

    // Credits check against workspace pool
    const wsCredits = await getWorkspaceCredits(c.env.DB, workspaceId);
    if (wsCredits.balanceCredits < AUDIO_TTS_CREDIT_COST) {
      throw new HTTPException(402, {
        message: `Need ${AUDIO_TTS_CREDIT_COST} credit, have ${wsCredits.balanceCredits}`,
      });
    }

    const now = Date.now();
    const jobId = crypto.randomUUID();

    try {
      await c.env.DB.batch([
        ...creditDeductStatements(c.env.DB, workspaceId, user.id, sessionId, 'audio_tts', AUDIO_TTS_CREDIT_COST, now),
        c.env.DB.prepare(`
          INSERT INTO step_audio (stepId, sessionId, userId, voiceoverSource, jobId, jobStartedAt, createdAt, updatedAt)
          VALUES (?, ?, ?, 'generating', ?, ?, ?, ?)
          ON CONFLICT(stepId, sessionId) DO UPDATE SET
            voiceoverSource = 'generating',
            jobId           = excluded.jobId,
            jobStartedAt    = excluded.jobStartedAt,
            updatedAt       = excluded.updatedAt
        `).bind(stepId, sessionId, user.id, jobId, now, now, now),
      ]);
    } catch (dbErr: any) {
      // Surface DB errors as 500 instead of crashing the worker (ERR_CONNECTION_CLOSED)
      console.error('[generate-audio] DB batch failed:', dbErr?.message ?? dbErr);
      throw new HTTPException(500, {
        message: `DB error: ${dbErr?.message ?? 'unknown'}. Ensure migration 0011_step_audio has been applied.`,
      });
    }

    try {
      await c.env.AUDIO_QUEUE.send({
        type: 'audio_tts',
        sessionId,
        stepId,
        text,
        userId: user.id,
        workspaceId,
        jobId,
        language,
      });
    } catch (qErr: any) {
      // Queue send failed — refund the credit and surface the error
      console.error('[generate-audio] Queue send failed:', qErr?.message ?? qErr);
      await c.env.DB.batch([
        ...creditRefundStatements(c.env.DB, workspaceId, user.id, sessionId, 'audio_tts', AUDIO_TTS_CREDIT_COST, now),
        c.env.DB.prepare(
          'UPDATE step_audio SET voiceoverSource = NULL, jobId = NULL, jobStartedAt = NULL, updatedAt = ? WHERE stepId = ? AND sessionId = ?'
        ).bind(now, stepId, sessionId),
      ]).catch(() => {}); // best-effort refund
      throw new HTTPException(503, {
        message: `Queue unavailable: ${qErr?.message ?? 'unknown'}. Credit refunded.`,
      });
    }

    // Best-effort low-credit notification (non-blocking)
    checkLowCreditNotify(c.env.DB, workspaceId).catch(() => {});

    return c.json({ jobId }, 202);
  }
);

// ─── POST revert-audio ───────────────────────────────────────────────────────

steps.post('/:sessionId/steps/:stepId/revert-audio', async (c) => {
  const user = c.get('user');
  const { sessionId, stepId } = c.req.param();

  await requireSession(c.env, sessionId, user.id);

  const row = await c.env.DB.prepare(
    'SELECT originalVoiceoverKey FROM step_audio WHERE stepId = ? AND sessionId = ?'
  ).bind(stepId, sessionId).first() as any;

  const revertKey = row?.originalVoiceoverKey ?? null;
  const revertSource = revertKey ? (revertKey.includes('tts') ? 'tts' : 'original') : null;

  await c.env.DB.prepare(`
    UPDATE step_audio
    SET voiceoverKey = ?, voiceoverSource = ?, originalVoiceoverKey = NULL, swapVoiceId = NULL, jobId = NULL, jobStartedAt = NULL, updatedAt = ?
    WHERE stepId = ? AND sessionId = ?
  `).bind(revertKey, revertSource, Date.now(), stepId, sessionId).run();

  return c.json({ voiceoverKey: revertKey, voiceoverSource: revertSource });
});

// ─── POST swap-voice ─────────────────────────────────────────────────────────

steps.post('/:sessionId/steps/:stepId/swap-voice',
  zValidator('json', SwapVoiceSchema),
  async (c) => {
    const user = c.get('user');
    const { sessionId, stepId } = c.req.param();
    const { voiceId } = c.req.valid('json');

    const session = await requireSession(c.env, sessionId, user.id);
    const workspaceId = session.workspaceId;

    // Ensure active audio exists and we're not already generating
    const existing = await c.env.DB.prepare(
      'SELECT voiceoverSource, voiceoverKey FROM step_audio WHERE stepId = ? AND sessionId = ?'
    ).bind(stepId, sessionId).first() as any;

    if (!existing || !existing.voiceoverKey) {
      throw new HTTPException(400, { message: 'No existing audio track found to swap voice on' });
    }

    if (existing.voiceoverSource === 'generating') {
      throw new HTTPException(409, { message: 'Audio generation or swap already in progress for this step' });
    }

    // Credits check against workspace pool
    const wsCreditsSwap = await getWorkspaceCredits(c.env.DB, workspaceId);
    if (wsCreditsSwap.balanceCredits < AUDIO_SWAP_CREDIT_COST) {
      throw new HTTPException(402, {
        message: `Need ${AUDIO_SWAP_CREDIT_COST} credit, have ${wsCreditsSwap.balanceCredits}`,
      });
    }

    const now = Date.now();
    const jobId = crypto.randomUUID();

    try {
      await c.env.DB.batch([
        ...creditDeductStatements(c.env.DB, workspaceId, user.id, sessionId, 'audio_swap', AUDIO_SWAP_CREDIT_COST, now),
        c.env.DB.prepare(`
          UPDATE step_audio SET
            voiceoverSource = 'generating',
            originalVoiceoverKey = COALESCE(originalVoiceoverKey, voiceoverKey),
            jobId           = ?,
            jobStartedAt    = ?,
            updatedAt       = ?
          WHERE stepId = ? AND sessionId = ?
        `).bind(jobId, now, now, stepId, sessionId),
      ]);
    } catch (dbErr: any) {
      console.error('[swap-voice] DB batch failed:', dbErr?.message ?? dbErr);
      throw new HTTPException(500, {
        message: `DB error: ${dbErr?.message ?? 'unknown'}`,
      });
    }

    try {
      await c.env.AUDIO_QUEUE.send({
        type: 'audio_swap',
        sessionId,
        stepId,
        voiceId,
        userId: user.id,
        workspaceId,
        jobId,
      });
    } catch (qErr: any) {
      // Queue send failed — refund the credit and restore original state
      console.error('[swap-voice] Queue send failed:', qErr?.message ?? qErr);
      await c.env.DB.batch([
        ...creditRefundStatements(c.env.DB, workspaceId, user.id, sessionId, 'audio_swap', AUDIO_SWAP_CREDIT_COST, now),
        c.env.DB.prepare(
          'UPDATE step_audio SET voiceoverSource = ?, jobId = NULL, jobStartedAt = NULL, updatedAt = ? WHERE stepId = ? AND sessionId = ?'
        ).bind(existing.voiceoverSource, now, stepId, sessionId),
      ]).catch(() => {}); // best-effort refund
      throw new HTTPException(503, {
        message: `Queue unavailable: ${qErr?.message ?? 'unknown'}. Credit refunded.`,
      });
    }

    // Best-effort low-credit notification (non-blocking)
    checkLowCreditNotify(c.env.DB, workspaceId).catch(() => {});

    return c.json({ jobId }, 202);
  }
);

// ─── GET audio-status ────────────────────────────────────────────────────────

steps.get('/:sessionId/steps/:stepId/audio-status', async (c) => {
  const user = c.get('user');
  const { sessionId, stepId } = c.req.param();

  const audioStatusSession = await requireSession(c.env, sessionId, user.id);

  const row = await c.env.DB.prepare(
    'SELECT voiceoverSource, voiceoverKey, voiceoverDurationMs, swapVoiceId, originalVoiceoverKey, jobId, jobStartedAt, userId, updatedAt FROM step_audio WHERE stepId = ? AND sessionId = ?'
  ).bind(stepId, sessionId).first() as any;

  if (!row) {
    return c.json({
      voiceoverSource: null,
      voiceoverKey: null,
      voiceoverDurationMs: null,
      swapVoiceId: null,
      originalVoiceoverKey: null,
      updatedAt: null,
    });
  }

  // Stuck-state TTL recovery: job didn't complete in 5 min → reset + refund
  if (row.voiceoverSource === 'generating' && row.jobStartedAt && (Date.now() - row.jobStartedAt > STUCK_JOB_TTL_MS)) {
    const now = Date.now();
    const isSwapJob = row.originalVoiceoverKey !== null;

    const updateQuery = isSwapJob
      ? c.env.DB.prepare(`
          UPDATE step_audio SET
            voiceoverKey = COALESCE(originalVoiceoverKey, voiceoverKey),
            voiceoverSource = CASE 
              WHEN originalVoiceoverKey IS NOT NULL THEN (CASE WHEN originalVoiceoverKey LIKE '%tts%' THEN 'tts' ELSE 'original' END)
              ELSE 'original'
            END,
            originalVoiceoverKey = NULL,
            swapVoiceId = NULL,
            jobId = NULL,
            jobStartedAt = NULL,
            updatedAt = ?
          WHERE stepId = ? AND sessionId = ?
        `).bind(now, stepId, sessionId)
      : c.env.DB.prepare(
          'UPDATE step_audio SET voiceoverSource = NULL, jobId = NULL, jobStartedAt = NULL, updatedAt = ? WHERE stepId = ? AND sessionId = ?'
        ).bind(now, stepId, sessionId);

    const ttlActionType = isSwapJob ? 'audio_swap' : 'audio_tts';
    await c.env.DB.batch([
      updateQuery,
      ...creditRefundStatements(c.env.DB, audioStatusSession.workspaceId, row.userId, sessionId, ttlActionType, 1, now),
    ]);

    const rolledBackVoiceoverKey = isSwapJob ? (row.originalVoiceoverKey ?? row.voiceoverKey) : null;
    const rolledBackVoiceoverSource = isSwapJob
      ? (row.originalVoiceoverKey ? (row.originalVoiceoverKey.includes('tts') ? 'tts' : 'original') : 'original')
      : null;

    return c.json({
      voiceoverSource: rolledBackVoiceoverSource,
      voiceoverKey: rolledBackVoiceoverKey,
      voiceoverDurationMs: row.voiceoverDurationMs,
      swapVoiceId: null,
      originalVoiceoverKey: null,
      updatedAt: now,
    });
  }

  return c.json({
    voiceoverSource: row.voiceoverSource,
    voiceoverKey: row.voiceoverKey,
    voiceoverDurationMs: row.voiceoverDurationMs,
    swapVoiceId: row.swapVoiceId,
    originalVoiceoverKey: row.originalVoiceoverKey,
    updatedAt: row.updatedAt,
  });
});

// ─── PATCH audio-duration ────────────────────────────────────────────────────

steps.patch('/:sessionId/steps/:stepId/audio-duration',
  zValidator('json', PatchDurationSchema),
  async (c) => {
    const user = c.get('user');
    const { sessionId, stepId } = c.req.param();
    const { durationMs } = c.req.valid('json');

    await requireSession(c.env, sessionId, user.id);

    await c.env.DB.prepare(
      'UPDATE step_audio SET voiceoverDurationMs = ?, updatedAt = ? WHERE stepId = ? AND sessionId = ?'
    ).bind(durationMs, Date.now(), stepId, sessionId).run();

    return c.json({ ok: true });
  }
);

// ─── POST generate-narration (session-level: all steps at once) ──────────────
//
// Generates AI voiceover for every step that has script text, deducting 1
// credit per step.  Returns the list of stepIds queued (client can then
// poll /audio-status for each, or just reload after a few seconds).

steps.post('/:sessionId/generate-narration', async (c) => {
  const user = c.get('user');
  const { sessionId } = c.req.param();
  const body = await c.req.json().catch(() => ({})) as { language?: string; voiceId?: string };
  const language = typeof body.language === 'string' ? body.language : undefined;
  const voiceId = typeof body.voiceId === 'string' ? body.voiceId : undefined;

  console.log(`[generate-narration] Overall request received: sessionId=${sessionId}, language=${language}, voiceId=${voiceId}`);

  const session = await requireSession(c.env, sessionId, user.id);
  const workspaceId = session.workspaceId;

  // Load steps from R2 — use the authoritative r2JsonKey from D1, not a
  // hardcoded path, so the correct file is read even if the key ever differs.
  const assetKey = (session as any).r2JsonKey || `sessions/${sessionId}/session.json`;
  const assetObj = await c.env.R2.get(assetKey);
  if (!assetObj) {
    throw new HTTPException(404, { message: 'Session asset not found' });
  }

  let envelope: any;
  try {
    envelope = JSON.parse(await assetObj.text());
  } catch (e) {
    throw new HTTPException(500, { message: 'Failed to parse session data' });
  }

  // ── Fetch D1 live step overrides in parallel ──────────────────────────────
  const [sopRow] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id FROM sops WHERE sessionId = ? LIMIT 1`
    ).bind(sessionId).first<{ id: string }>(),
  ]);

  const d1TextByStepId = new Map<string, string>();
  if (sopRow?.id) {
    try {
      const { results } = await c.env.DB.prepare(
        `SELECT id, content FROM steps WHERE sopId = ?`
      ).bind(sopRow.id).all<{ id: string; content: string }>();
      if (results) {
        for (const row of results) {
          try {
            const content = JSON.parse(row.content);
            if (typeof content?.textOverride === 'string') {
              d1TextByStepId.set(row.id, content.textOverride);
            }
          } catch {}
        }
      }
    } catch (d1Err) {
      console.error(`[generate-narration] Failed to fetch D1 steps:`, d1Err);
    }
  }

  // Build (stepId → text) map — prefer textOverride, fall back to generatedText / elementText
  const stepsWithText: { id: string; text: string }[] = [];
  for (const step of (envelope.steps || [])) {
    const d1Override = d1TextByStepId.get(step.id);
    const text: string = d1Override !== undefined ? d1Override : (step.textOverride || step.generatedText || step.elementText || '');
    if (text.trim() && text.trim().toLowerCase() !== '[silence]') {
      stepsWithText.push({ id: step.id, text: text.trim() });
    }
  }

  console.log(`[generate-narration] Found ${stepsWithText.length} total steps with valid text to narrate out of ${envelope.steps?.length ?? 0} total steps in session.`);

  if (stepsWithText.length === 0) {
    throw new HTTPException(400, { message: 'No steps with text found to narrate' });
  }

  // Credits check — 1 per step, against workspace pool
  const creditCost = stepsWithText.length * AUDIO_TTS_CREDIT_COST;
  const wsCreditsNarration = await getWorkspaceCredits(c.env.DB, workspaceId);

  if (wsCreditsNarration.balanceCredits < creditCost) {
    throw new HTTPException(402, {
      message: `Need ${creditCost} credits for ${stepsWithText.length} steps, have ${wsCreditsNarration.balanceCredits}`,
    });
  }

  const now = Date.now();

  // Deduct credits + mark all steps as 'generating' in one batch
  const dbStatements: any[] = [
    ...creditDeductStatements(c.env.DB, workspaceId, user.id, sessionId, 'audio_narration', creditCost, now),
  ];

  const jobs: { stepId: string; jobId: string; text: string }[] = [];
  for (const { id: stepId, text } of stepsWithText) {
    const jobId = crypto.randomUUID();
    jobs.push({ stepId, jobId, text });
    dbStatements.push(
      c.env.DB.prepare(`
        INSERT INTO step_audio (stepId, sessionId, userId, voiceoverSource, jobId, jobStartedAt, createdAt, updatedAt)
        VALUES (?, ?, ?, 'generating', ?, ?, ?, ?)
        ON CONFLICT(stepId, sessionId) DO UPDATE SET
          voiceoverSource = 'generating',
          jobId           = excluded.jobId,
          jobStartedAt    = excluded.jobStartedAt,
          updatedAt       = excluded.updatedAt
      `).bind(stepId, sessionId, user.id, jobId, now, now, now)
    );
  }

  try {
    await c.env.DB.batch(dbStatements);
  } catch (dbErr: any) {
    console.error('[generate-narration] DB batch failed:', dbErr?.message ?? dbErr);
    throw new HTTPException(500, { message: `DB error: ${dbErr?.message ?? 'unknown'}` });
  }

  // Queue audio jobs for each step
  const failed: string[] = [];
  for (const { stepId, jobId, text } of jobs) {
    try {
      console.log(`[generate-narration] Queueing audio_tts job for stepId=${stepId}, jobId=${jobId}`);
      await c.env.AUDIO_QUEUE.send({
        type: 'audio_tts',
        sessionId,
        stepId,
        text,
        userId: user.id,
        workspaceId,
        jobId,
        language,
        voiceId,
      });
    } catch (qErr: any) {
      console.error(`[generate-narration] Queue failed for step ${stepId}:`, qErr?.message);
      failed.push(stepId);
    }
  }

  // Best-effort refund for any steps that failed to queue
  if (failed.length > 0) {
    const refund = failed.length * AUDIO_TTS_CREDIT_COST;
    await c.env.DB.batch([
      ...creditRefundStatements(c.env.DB, workspaceId, user.id, sessionId, 'audio_narration', refund, now),
      ...failed.map(failedStepId =>
        c.env.DB.prepare(
          'UPDATE step_audio SET voiceoverSource = NULL, jobId = NULL, jobStartedAt = NULL, updatedAt = ? WHERE stepId = ? AND sessionId = ?'
        ).bind(now, failedStepId, sessionId)
      ),
    ]).catch(() => {});
  }

  const queued = jobs.filter(j => !failed.includes(j.stepId)).map(j => j.stepId);
  console.log(`[generate-narration] Finished queueing. Queued: ${queued.length}, Skipped/Failed: ${failed.length}`);

  // Best-effort low-credit notification (non-blocking)
  checkLowCreditNotify(c.env.DB, workspaceId).catch(() => {});

  return c.json({ queued, skipped: failed, totalCost: queued.length }, 202);
});

// ─── GET narration-status (session-level: all steps) ─────────────────────────

steps.get('/:sessionId/narration-status', async (c) => {
  const user = c.get('user');
  const { sessionId } = c.req.param();

  await requireSession(c.env, sessionId, user.id);

  const { results } = await c.env.DB.prepare(
    `SELECT stepId, voiceoverSource, voiceoverKey, voiceoverDurationMs, swapVoiceId, originalVoiceoverKey, updatedAt
     FROM step_audio WHERE sessionId = ?`
  ).bind(sessionId).all<{
    stepId: string;
    voiceoverSource: string | null;
    voiceoverKey: string | null;
    voiceoverDurationMs: number | null;
    swapVoiceId: string | null;
    originalVoiceoverKey: string | null;
    updatedAt: number | null;
  }>();

  return c.json({ steps: results });
});

// POST /:sessionId/steps/:stepId/screenshot — replace screenshot for a step
steps.post('/:sessionId/steps/:stepId/screenshot', async (c) => {
  const user = c.get('user');
  const { sessionId, stepId } = c.req.param();

  const session = await requireSession(c.env, sessionId, user.id);

  // Accept multipart/form-data with a 'file' field
  const formData = await c.req.formData().catch(() => null);
  const file = formData?.get('file') as File | null;
  if (!file) return c.json({ error: 'Missing file field in form data' }, 400);

  const ext = file.type.includes('png') ? 'png' : 'jpg';
  const r2Key = `sessions/${sessionId}/screenshots/${stepId}.${ext}`;

  await c.env.R2.put(r2Key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  // Patch step content in the SOP (find the SOP for this session)
  const sopRow = await c.env.DB.prepare(
    'SELECT id FROM sops WHERE sessionId = ? AND workspaceId = ? LIMIT 1'
  ).bind(sessionId, session.workspaceId).first<{ id: string }>();

  if (sopRow) {
    const existing = await c.env.DB.prepare(
      'SELECT content FROM steps WHERE id = ? AND sopId = ?'
    ).bind(stepId, sopRow.id).first<{ content: string }>();

    if (existing) {
      const content = JSON.parse(existing.content);
      content.screenshotKey = r2Key;
      await c.env.DB.prepare(
        'UPDATE steps SET content = ?, updatedAt = ? WHERE id = ? AND sopId = ?'
      ).bind(JSON.stringify(content), Date.now(), stepId, sopRow.id).run();
    }
  }

  const origin = new URL(c.req.url).origin;
  return c.json({ screenshotKey: r2Key, screenshotUrl: `${origin}/v1/assets/${r2Key}` });
});

// DELETE /:sessionId/steps/:stepId — remove a step from the session JSON in R2
steps.delete('/:sessionId/steps/:stepId', async (c) => {
  const user = c.get('user');
  const { sessionId, stepId } = c.req.param();

  await requireSession(c.env, sessionId, user.id);

  const assetKey = `sessions/${sessionId}/session.json`;
  const assetObj = await c.env.R2.get(assetKey);
  if (!assetObj) throw new HTTPException(404, { message: 'Session asset not found' });

  let envelope: any;
  try {
    envelope = JSON.parse(await assetObj.text());
  } catch {
    throw new HTTPException(500, { message: 'Invalid session data' });
  }

  const originalCount = (envelope.steps ?? []).length;
  envelope.steps = (envelope.steps ?? []).filter((s: any) => s.id !== stepId);

  if (envelope.steps.length === originalCount) {
    return c.json({ error: 'Step not found' }, 404);
  }

  // Re-sequence remaining steps
  envelope.steps = envelope.steps.map((s: any, i: number) => ({ ...s, sequence: i + 1 }));
  if (envelope.metadata) envelope.metadata.stepCount = envelope.steps.length;

  await c.env.R2.put(assetKey, JSON.stringify(envelope), {
    httpMetadata: { contentType: 'application/json' },
  });

  await c.env.DB.prepare(
    'UPDATE sessions SET stepCount = ?, updatedAt = ? WHERE id = ?'
  ).bind(envelope.steps.length, Date.now(), sessionId).run();

  return c.json({ ok: true, stepCount: envelope.steps.length });
});

export default steps;
