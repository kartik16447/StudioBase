import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { Env, Variables } from '../../types/hono';
import { authMiddleware } from '../../middlewares/auth';

const waitlist = new Hono<{ Bindings: Env; Variables: Variables }>();

// ── POST /v1/waitlist ─────────────────────────────────────────────────────────
// Public endpoint — no auth required.
// Body: { email: string, source?: string }
// Returns: { ok: true, alreadyRegistered: boolean }
waitlist.post('/', async (c) => {
  let body: { email?: string; source?: string };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: 'Invalid JSON body' });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: 'Valid email is required' }, 400);
  }

  const source = (body.source ?? 'landing').trim().slice(0, 64);

  // INSERT OR IGNORE — no error if email already exists
  const result = await c.env.DB.prepare(
    `INSERT OR IGNORE INTO waitlist (id, email, source, createdAt)
     VALUES (?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), email, source, Date.now())
    .run();

  const alreadyRegistered = result.meta.changes === 0;
  return c.json({ ok: true, alreadyRegistered }, 200);
});

// ── GET /v1/waitlist ──────────────────────────────────────────────────────────
// Admin-only — returns paginated list of sign-ups.
// Query params: limit (default 100), offset (default 0)
waitlist.get('/', authMiddleware(), async (c) => {
  const user = c.get('user');
  if (user.email !== c.env.ADMIN_EMAIL) {
    throw new HTTPException(403, { message: 'Forbidden' });
  }

  const limit  = Math.min(parseInt(c.req.query('limit')  ?? '100', 10), 500);
  const offset = Math.max(parseInt(c.req.query('offset') ?? '0',   10), 0);

  const { results } = await c.env.DB.prepare(
    `SELECT id, email, source, createdAt
     FROM waitlist
     ORDER BY createdAt DESC
     LIMIT ? OFFSET ?`
  )
    .bind(limit, offset)
    .all<{ id: string; email: string; source: string; createdAt: number }>();

  const { results: countResult } = await c.env.DB.prepare(
    'SELECT COUNT(*) as total FROM waitlist'
  ).all<{ total: number }>();

  return c.json({
    data:   results,
    total:  countResult[0]?.total ?? 0,
    limit,
    offset,
  });
});

export default waitlist;
