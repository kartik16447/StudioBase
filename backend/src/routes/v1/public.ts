import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';

export const publicRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// Helper: resolve a session by shareToken OR session id (for direct sharing / testing)
async function resolveSession(db: Env['DB'], token: string) {
  // Try shareToken first (production share links)
  let row = await db.prepare(
    `SELECT id, capturedTitle, capturedAt, capturedUrl, r2JsonKey, status, ownerId, shareToken
     FROM sessions WHERE shareToken = ? AND isPublic = 1 AND status = 'ready'`
  ).bind(token).first<any>();

  // Fallback: treat token as a session id (useful for testing / direct links)
  if (!row) {
    row = await db.prepare(
      `SELECT id, capturedTitle, capturedAt, capturedUrl, r2JsonKey, status, ownerId, shareToken
       FROM sessions WHERE id = ? AND status = 'ready'`
    ).bind(token).first<any>();
  }

  return row ?? null;
}

// GET /v1/public/:shareToken — no auth required
publicRoutes.get('/:shareToken', async (c) => {
  const { shareToken } = c.req.param();

  const session = await resolveSession(c.env.DB, shareToken);
  if (!session) return c.json({ error: 'Not found' }, 404);

  // Fetch owner name
  const owner = await c.env.DB.prepare(
    `SELECT displayName, email FROM users WHERE id = ?`
  ).bind(session.ownerId).first<any>();

  // Use the resolved session id (not the token) as the key for asset sub-routes
  const origin = new URL(c.req.url).origin;
  const sessionJsonUrl = session.r2JsonKey
    ? `${origin}/v1/public/${shareToken}/json`
    : null;

  return c.json({
    id: session.id,
    capturedTitle: session.capturedTitle,
    capturedAt: session.capturedAt,
    capturedUrl: session.capturedUrl,
    status: session.status,
    sessionJsonUrl,
    owner: owner
      ? { name: owner.displayName || owner.email?.split('@')[0] || 'Anonymous' }
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

  if (Array.isArray(json.steps)) {
    for (const step of json.steps) {
      const key = step.screenshotKey;
      if (key && !assets[key]) {
        assets[key] = `${origin}/v1/public/${shareToken}/asset/${encodeURIComponent(key)}`;
      }
    }
  }

  return c.json({ ...json, assets });
});

// GET /v1/public/:shareToken/asset/:key — serve individual R2 assets publicly
publicRoutes.get('/:shareToken/asset/:key{.+}', async (c) => {
  const { shareToken, key } = c.req.param();

  // Verify session exists (public OR direct id access)
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
