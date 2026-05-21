import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';

export const publicRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// Helper: resolve a session by shareToken OR session id (for direct sharing / testing)
// NOTE: column is `createdAt` not `capturedAt` in D1 schema
async function resolveSession(db: Env['DB'], token: string) {
  // Try shareToken first (production share links — must be public)
  let row = await db.prepare(
    `SELECT id, title, capturedTitle, createdAt, capturedUrl, r2JsonKey, status, ownerId, shareToken,
            cinematicEnabled, sopEnabled, rawEnabled
     FROM sessions WHERE shareToken = ? AND isPublic = 1`
  ).bind(token).first<any>();

  // Fallback: treat token as session id — allows direct links without Publish step
  if (!row) {
    row = await db.prepare(
      `SELECT id, title, capturedTitle, createdAt, capturedUrl, r2JsonKey, status, ownerId, shareToken,
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
  const [obj, sessionMeta, sopRow] = await Promise.all([
    c.env.R2.get(session.r2JsonKey),

    // Session metadata holds stepOverrides (zoom / animationTarget edits)
    c.env.DB.prepare(
      `SELECT metadata FROM sessions WHERE id = ?`
    ).bind(session.id).first<{ metadata: string | null }>(),

    // Linked SOP row — gives us sopId to fetch live step text overrides
    c.env.DB.prepare(
      `SELECT id FROM sops WHERE sessionId = ? LIMIT 1`
    ).bind(session.id).first<{ id: string }>(),
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

  // ── Build asset proxy map ────────────────────────────────────────────────
  const origin = new URL(c.req.url).origin;
  const assets: Record<string, string> = {};

  // Expose raw screen recording video through the public proxy
  if (json.videoKey && typeof json.videoKey === 'string') {
    assets[json.videoKey] = `${origin}/v1/public/${shareToken}/asset/${encodeURIComponent(json.videoKey)}`;
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
  const ZOOM_MAX = 1.40; // mirror RenderConstants.CAMERA_SCALE_LIMITS.max
  const ZOOM_MIN = 1.00;
  if (Array.isArray(json.steps)) {
    json.steps = json.steps.map((step: any) => {
      const override   = stepOverrides[step.id] || {};
      const liveText   = d1TextByStepId.get(step.id);

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

      return { ...step, coordinates, animationTarget, textOverride };
    });
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
    'Cache-Control': 'public, max-age=86400',
    'Access-Control-Allow-Origin': '*',
  });
});
