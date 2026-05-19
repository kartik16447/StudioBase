import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';

export const publicRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// Helper: resolve a session by shareToken OR session id (for direct sharing / testing)
// NOTE: column is `createdAt` not `capturedAt` in D1 schema
async function resolveSession(db: Env['DB'], token: string) {
  // Try shareToken first (production share links — must be public)
  let row = await db.prepare(
    `SELECT id, title, capturedTitle, createdAt, capturedUrl, r2JsonKey, status, ownerId, shareToken
     FROM sessions WHERE shareToken = ? AND isPublic = 1`
  ).bind(token).first<any>();

  // Fallback: treat token as session id — allows direct links without Publish step
  if (!row) {
    row = await db.prepare(
      `SELECT id, title, capturedTitle, createdAt, capturedUrl, r2JsonKey, status, ownerId, shareToken
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
    owner: owner
      ? { name: owner.name || owner.email?.split('@')[0] || 'Anonymous' }
      : { name: 'Anonymous' },
  });
});

// GET /v1/public/:shareToken/json — serve R2 session JSON publicly
publicRoutes.get('/:shareToken/json', async (c) => {
  const { shareToken } = c.req.param();

  const session = await resolveSession(c.env.DB, shareToken);
  if (!session?.r2JsonKey) return c.json({ error: 'Not found' }, 404);

  const obj = await c.env.R2.get(session.r2JsonKey);
  if (!obj) return c.json({ error: 'Asset not found' }, 404);

  const json = await obj.json() as any;

  // Rewrite screenshotKeys → public proxy URLs
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
    // Build index → r2Key map and register all keys in assets
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
          byIndex.get(step.sequence ?? i) ??   // prefer sequence field
          byIndex.get(i) ??                      // fallback to array index
          null;
        return key ? { ...step, screenshotKey: key } : step;
      });
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
    'Cache-Control': 'public, max-age=86400',
    'Access-Control-Allow-Origin': '*',
  });
});
