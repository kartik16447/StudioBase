import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { DocumentService } from '../../services/DocumentService';

export const publicRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// Helper: resolve a session by shareToken OR session id (for direct sharing / testing)
// NOTE: column is `createdAt` not `capturedAt` in D1 schema
async function resolveSession(db: Env['DB'], token: string) {
  // Try shareToken first (production share links — must be public)
  let row = await db.prepare(
    `SELECT id, title, capturedTitle, createdAt, capturedUrl, r2JsonKey, r2VideoKey, status, ownerId, shareToken,
            cinematicEnabled, sopEnabled, rawEnabled
     FROM sessions WHERE shareToken = ? AND isPublic = 1`
  ).bind(token).first<any>();

  // Fallback: treat token as session id — allows direct links without Publish step
  if (!row) {
    row = await db.prepare(
      `SELECT id, title, capturedTitle, createdAt, capturedUrl, r2JsonKey, r2VideoKey, status, ownerId, shareToken,
              cinematicEnabled, sopEnabled, rawEnabled
       FROM sessions WHERE id = ? AND deletedAt IS NULL`
    ).bind(token).first<any>();
  }

  return row ?? null;
}

// GET /v1/public/:shareToken — no auth required
publicRoutes.get('/:shareToken', async (c) => {
  const { shareToken } = c.req.param();

  const session = await resolveSession(c.env.DB, shareToken);
  if (!session) return c.json({ error: 'Not found' }, 404);

  const owner = await c.env.DB.prepare(
    `SELECT name, email FROM users WHERE id = ?`
  ).bind(session.ownerId).first<any>();

  const origin = new URL(c.req.url).origin;
  const sessionJsonUrl = session.r2JsonKey
    ? `${origin}/v1/public/${shareToken}/json`
    : null;

  return c.json({
    id: session.id,
    capturedTitle: session.capturedTitle || session.title,
    capturedAt: session.createdAt,   // map createdAt → capturedAt for frontend compat
    capturedUrl: session.capturedUrl,
    status: session.status,
    sessionJsonUrl,
    cinematicEnabled: session.cinematicEnabled === 1,
    sopEnabled: session.sopEnabled !== 0,   // default true (column defaults to 1)
    rawEnabled: session.rawEnabled !== 0,   // default true
    owner: owner
      ? { name: owner.name || owner.email?.split('@')[0] || 'Anonymous' }
      : { name: 'Anonymous' },
  });
});

// GET /v1/public/:shareToken/json — serve R2 session JSON publicly
// Always merges live D1 data (zoom overrides + text edits) on top of the R2
// snapshot so dashboard edits are immediately reflected on the share page.
publicRoutes.get('/:shareToken/json', async (c) => {
  const { shareToken } = c.req.param();

  const session = await resolveSession(c.env.DB, shareToken);
  if (!session?.r2JsonKey) return c.json({ error: 'Not found' }, 404);

  // ── Fetch R2 snapshot + D1 live overrides in parallel ───────────────────
  const [obj, sessionMeta, sopRow, audioRows] = await Promise.all([
    c.env.R2.get(session.r2JsonKey),

    // Session metadata holds stepOverrides (zoom / animationTarget edits)
    c.env.DB.prepare(
      `SELECT metadata FROM sessions WHERE id = ?`
    ).bind(session.id).first<{ metadata: string | null }>(),

    // Linked SOP row — gives us sopId to fetch live step text overrides
    c.env.DB.prepare(
      `SELECT id FROM sops WHERE sessionId = ? LIMIT 1`
    ).bind(session.id).first<{ id: string }>(),

    // Query D1 step_audio for live voiceovers
    c.env.DB.prepare(
      `SELECT stepId, voiceoverKey, originalVoiceoverKey, syntheticVoiceoverKey,
              voiceoverSource, voiceoverDurationMs, swapVoiceId
       FROM step_audio WHERE sessionId = ?`
    ).bind(session.id).all<{
      stepId: string;
      voiceoverKey: string | null;
      originalVoiceoverKey: string | null;
      syntheticVoiceoverKey: string | null;
      voiceoverSource: string | null;
      voiceoverDurationMs: number | null;
      swapVoiceId: string | null;
    }>(),
  ]);

  if (!obj) return c.json({ error: 'Asset not found' }, 404);

  const json = await obj.json() as any;

  // ── Parse D1 live overrides ──────────────────────────────────────────────
  // animationTarget per step: stored in session.metadata.stepOverrides[stepId]
  let stepOverrides: Record<string, { animationTarget?: any }> = {};
  if (sessionMeta?.metadata) {
    try {
      const meta = JSON.parse(sessionMeta.metadata);
      stepOverrides = meta?.stepOverrides || {};
    } catch {}
  }

  // textOverride per step: stored in D1 steps table (content JSON blob)
  const d1TextByStepId = new Map<string, string>();
  if (sopRow?.id) {
    try {
      const { results } = await c.env.DB.prepare(
        `SELECT id, content FROM steps WHERE sopId = ? ORDER BY stepIndex ASC`
      ).bind(sopRow.id).all<{ id: string; content: string }>();
      for (const row of results) {
        try {
          const content = JSON.parse(row.content);
          if (content?.textOverride) d1TextByStepId.set(row.id, content.textOverride);
        } catch {}
      }
    } catch {}
  }

  // Parse step_audio into a map
  const stepAudioMap = new Map<string, any>();
  if (audioRows?.results) {
    for (const row of audioRows.results) {
      stepAudioMap.set(row.stepId, row);
    }
  }

  // ── Build asset proxy map ────────────────────────────────────────────────
  const origin = new URL(c.req.url).origin;
  const assets: Record<string, string> = {};

  // Expose raw screen recording video through the public proxy.
  // The R2 JSON envelope stores videoKey; older sessions may not have it, so
  // fall back to the r2VideoKey column in D1 (written by the extension finalizer).
  const resolvedVideoKey: string | null =
    (json.videoKey && typeof json.videoKey === 'string' ? json.videoKey : null) ??
    (session.r2VideoKey && typeof session.r2VideoKey === 'string' ? session.r2VideoKey : null);

  if (resolvedVideoKey) {
    assets[resolvedVideoKey] = `${origin}/v1/public/${shareToken}/asset/${encodeURIComponent(resolvedVideoKey)}`;
    // Patch the envelope so the frontend can look up the URL via session.videoKey
    json.videoKey = resolvedVideoKey;
  }

  const resolvedExportKey: string | null =
    (json.exportKey && typeof json.exportKey === 'string' ? json.exportKey : null) ??
    (session.r2ExportKey && typeof session.r2ExportKey === 'string' ? session.r2ExportKey : null);

  if (resolvedExportKey) {
    assets[resolvedExportKey] = `${origin}/v1/public/${shareToken}/asset/${encodeURIComponent(resolvedExportKey)}`;
    json.exportKey = resolvedExportKey;
  }

  // Pass 1: per-step screenshotKey (set by older pipeline versions)
  if (Array.isArray(json.steps)) {
    for (const step of json.steps) {
      const key = step.screenshotKey;
      if (key && !assets[key]) {
        assets[key] = `${origin}/v1/public/${shareToken}/asset/${encodeURIComponent(key)}`;
      }
    }
  }

  // Pass 2: top-level screenshots[] array written by the extension uploader
  // Format: [{ stepIndex: number, r2Key: string }]
  const screenshotsArr = json.screenshots as Array<{ stepIndex: number; r2Key: string }> | undefined;
  if (Array.isArray(screenshotsArr)) {
    const byIndex = new Map<number, string>();
    for (const s of screenshotsArr) {
      if (s.r2Key) {
        byIndex.set(s.stepIndex, s.r2Key);
        if (!assets[s.r2Key]) {
          assets[s.r2Key] = `${origin}/v1/public/${shareToken}/asset/${encodeURIComponent(s.r2Key)}`;
        }
      }
    }

    // Attach screenshotKey to each step that doesn't already have one
    if (Array.isArray(json.steps)) {
      json.steps = json.steps.map((step: any, i: number) => {
        if (step.screenshotKey) return step;
        const key =
          byIndex.get(step.sequence ?? i) ??
          byIndex.get(i) ??
          null;
        return key ? { ...step, screenshotKey: key } : step;
      });
    }
  }

  // ── Normalize steps: merge D1 live edits + promote nested fields ─────────
  // This ensures the share page always reflects the latest dashboard edits:
  //   • animationTarget (zoom) — from session.metadata.stepOverrides (D1)
  //   • textOverride (text edits) — from steps table (D1)
  //   • coordinates — promoted from step.data.coordinates if not at root
  //   • voiceoverKey, voiceoverSource, voiceoverDurationMs, etc. — from step_audio (D1)
  const ZOOM_MAX = 1.40; // mirror RenderConstants.CAMERA_SCALE_LIMITS.max
  const ZOOM_MIN = 1.00;
  if (Array.isArray(json.steps)) {
    json.steps = json.steps.map((step: any) => {
      const override   = stepOverrides[step.id] || {};
      const liveText   = d1TextByStepId.get(step.id);
      const audio      = stepAudioMap.get(step.id);

      // Normalize coordinates to root level (pipeline may nest them in step.data)
      const coordinates =
        step.coordinates ??
        step.data?.coordinates ??
        null;

      // animationTarget: D1 stepOverride wins → R2 root → R2 nested
      // Clamp zoomScale here so old pre-clamp R2 values can't exceed the limit
      const rawTarget =
        override.animationTarget ??
        step.animationTarget ??
        step.data?.animationTarget ??
        null;
      const animationTarget = rawTarget
        ? { ...rawTarget, zoomScale: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, rawTarget.zoomScale ?? ZOOM_MIN)) }
        : null;

      // textOverride: D1 step content wins → R2 value
      const textOverride =
        liveText ??
        step.textOverride ??
        null;

      // Audio hydration from D1 step_audio
      const voiceoverKey = audio?.voiceoverKey ?? step.voiceoverKey ?? null;
      const originalVoiceoverKey = audio?.originalVoiceoverKey ?? step.originalVoiceoverKey ?? null;
      const syntheticVoiceoverKey = audio?.syntheticVoiceoverKey ?? step.syntheticVoiceoverKey ?? null;
      const voiceoverSource = audio?.voiceoverSource ?? step.voiceoverSource ?? null;
      const voiceoverDurationMs = audio?.voiceoverDurationMs ?? step.voiceoverDurationMs ?? null;
      const swapVoiceId = audio?.swapVoiceId ?? step.swapVoiceId ?? null;

      return {
        ...step,
        coordinates,
        animationTarget,
        textOverride,
        voiceoverKey,
        originalVoiceoverKey,
        syntheticVoiceoverKey,
        voiceoverSource,
        voiceoverDurationMs,
        swapVoiceId
      };
    });
  }

  // Pass 3: register voiceover files in assets proxy (run after step normalization)
  if (Array.isArray(json.steps)) {
    for (const step of json.steps) {
      const keys = [step.voiceoverKey, step.originalVoiceoverKey, step.syntheticVoiceoverKey];
      for (const key of keys) {
        if (key && !assets[key]) {
          assets[key] = `${origin}/v1/public/${shareToken}/asset/${encodeURIComponent(key)}`;
        }
      }
    }
  }

  return c.json({ ...json, assets });
});

// GET /v1/public/:shareToken/asset/:key — serve individual R2 assets publicly
publicRoutes.get('/:shareToken/asset/:key{.+}', async (c) => {
  const { shareToken, key } = c.req.param();

  const session = await resolveSession(c.env.DB, shareToken);
  if (!session) return c.json({ error: 'Not found' }, 404);

  const obj = await c.env.R2.get(decodeURIComponent(key));
  if (!obj) return c.json({ error: 'Asset not found' }, 404);

  const contentType = obj.httpMetadata?.contentType || 'image/png';
  return c.body(obj.body as any, 200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*',
  });
});

publicRoutes.post('/admin/trigger-swap-voice', async (c) => {
  const { AudioProcessor } = await import('../../services/audio/AudioProcessor');
  try {
    const { sessionId, stepId, voiceId } = await c.req.json();
    console.log(`[PUBLIC ADMIN SWAP] Triggering swap for sessionId: ${sessionId}, stepId: ${stepId}, voiceId: ${voiceId}`);
    
    const audioProcessor = new AudioProcessor(c.env);
    
    // Find ownerId and workspaceId for audit logs
    const session = await c.env.DB.prepare(
      'SELECT ownerId, workspaceId FROM sessions WHERE id = ?'
    ).bind(sessionId).first<any>();
    
    if (!session) {
      return c.json({ error: `Session not found: ${sessionId}` }, 404);
    }
    
    // Ensure active audio exists and we're not already generating
    const existing = await c.env.DB.prepare(
      'SELECT voiceoverSource, voiceoverKey FROM step_audio WHERE stepId = ? AND sessionId = ?'
    ).bind(stepId, sessionId).first() as any;

    if (!existing || !existing.voiceoverKey) {
      console.log(`[PUBLIC ADMIN SWAP] No existing audio track found for stepId=${stepId}. Running TTS generation first.`);
      
      // Fetch step text from steps table
      const stepRow = await c.env.DB.prepare(
        'SELECT content FROM steps WHERE id = ? AND sopId = (SELECT id FROM sops WHERE sessionId = ? LIMIT 1)'
      ).bind(stepId, sessionId).first<{ content: string }>();

      let text = 'Navigate to the next screen';
      if (stepRow?.content) {
        try {
          const data = JSON.parse(stepRow.content);
          text = data.textOverride || data.generatedText || data.elementText || text;
        } catch {}
      }
      
      console.log(`[PUBLIC ADMIN SWAP] Step text extracted: "${text}"`);

      const ttsJob = {
        type: 'audio_tts' as const,
        sessionId,
        stepId,
        text,
        userId: session.ownerId,
        workspaceId: session.workspaceId,
        jobId: crypto.randomUUID()
      };
      
      await audioProcessor.process(ttsJob);
      console.log(`[PUBLIC ADMIN SWAP] TTS generation successful for stepId=${stepId}. Proceeding to swap.`);
    }
    
    const job = {
      type: 'audio_swap' as const,
      sessionId,
      stepId,
      voiceId,
      userId: session.ownerId,
      workspaceId: session.workspaceId,
      jobId: crypto.randomUUID()
    };
    
    await audioProcessor.processSwap(job);
    
    return c.json({ success: true, job });
  } catch (err: any) {
    console.error(`[PUBLIC ADMIN SWAP] Error running processSwap:`, err);
    return c.json({ success: false, error: err.message, stack: err.stack }, 500);
  }
});

// GET /v1/public/docs/:shareToken — no auth, returns read-only doc
publicRoutes.get('/docs/:shareToken', async (c) => {
  const { shareToken } = c.req.param();
  const service = new DocumentService(c.env.DB);
  const doc = await service.getByShareToken(shareToken);
  if (!doc) return c.json({ error: 'Not found' }, 404);
  return c.json({
    title: doc.title,
    emoji: doc.emoji,
    blocks: JSON.parse(doc.blocks),
  });
});

