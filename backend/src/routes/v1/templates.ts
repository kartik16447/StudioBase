import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { authMiddleware, requireWorkspaceMembership } from '../../middlewares/auth';
import { workspaceMiddleware } from '../../middlewares/workspace';
import { HTTPException } from 'hono/http-exception';

const templates = new Hono<{ Bindings: Env; Variables: Variables }>();

templates.use('*', authMiddleware(), workspaceMiddleware());

// GET /v1/templates/featured — top 6 featured global templates
templates.get('/featured', requireWorkspaceMembership('viewer'), async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT * FROM templates WHERE isGlobal = 1 AND isFeatured = 1 ORDER BY usageCount DESC LIMIT 6`
  ).all();
  return c.json(rows.results ?? []);
});

// GET /v1/templates — all global templates, optional ?category= filter
templates.get('/', requireWorkspaceMembership('viewer'), async (c) => {
  const category = c.req.query('category');
  let query = `SELECT * FROM templates WHERE isGlobal = 1`;
  const params: any[] = [];
  if (category) {
    query += ` AND category = ?`;
    params.push(category);
  }
  query += ` ORDER BY isFeatured DESC, usageCount DESC`;
  const rows = await c.env.DB.prepare(query).bind(...params).all();
  return c.json(rows.results ?? []);
});

// GET /v1/templates/workspace — templates belonging to current workspace
templates.get('/workspace', requireWorkspaceMembership('viewer'), async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT * FROM templates WHERE workspaceId = ? ORDER BY createdAt DESC`
  ).bind(user.workspaceId).all();
  return c.json(rows.results ?? []);
});

// POST /v1/templates — create a template from an existing session
templates.post('/', requireWorkspaceMembership('editor'), async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({})) as any;
  const { sessionId, title, description, category, isGlobal } = body;

  if (!sessionId || !title || !category) {
    throw new HTTPException(400, { message: 'sessionId, title, and category are required' });
  }

  const validCategories = [
    'feature-walkthrough', 'client-onboarding', 'design-handoff',
    'process-runbook', 'product-demo', 'quick-howto',
  ];
  if (!validCategories.includes(category)) {
    throw new HTTPException(400, { message: 'Invalid category' });
  }

  const session = await c.env.DB.prepare(
    `SELECT id, r2JsonKey, title FROM sessions WHERE id = ? AND workspaceId = ? AND deletedAt IS NULL`
  ).bind(sessionId, user.workspaceId).first() as any;

  if (!session) throw new HTTPException(404, { message: 'Session not found' });
  if (!session.r2JsonKey) throw new HTTPException(400, { message: 'Session has no content yet' });

  // Copy session JSON to a new templates R2 key
  const templateId = crypto.randomUUID();
  const sessionJsonKey = `templates/${templateId}/session.json`;

  const obj = await c.env.R2.get(session.r2JsonKey);
  if (!obj) throw new HTTPException(404, { message: 'Session content not found in storage' });
  const body2 = await obj.arrayBuffer();
  await c.env.R2.put(sessionJsonKey, body2, { httpMetadata: { contentType: 'application/json' } });

  const now = Date.now();
  const global = isGlobal ? 1 : 0;
  await c.env.DB.prepare(
    `INSERT INTO templates (id, workspaceId, createdBy, title, description, category, isGlobal, isFeatured, usageCount, sessionJsonKey, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`
  ).bind(templateId, user.workspaceId, user.id, title, description ?? null, category, global, sessionJsonKey, now, now).run();

  const template = await c.env.DB.prepare(`SELECT * FROM templates WHERE id = ?`).bind(templateId).first();
  return c.json(template, 201);
});

// POST /v1/templates/:id/use — create a new session from a template
templates.post('/:id/use', requireWorkspaceMembership('editor'), async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  const template = await c.env.DB.prepare(
    `SELECT * FROM templates WHERE id = ? AND (isGlobal = 1 OR workspaceId = ?)`
  ).bind(id, user.workspaceId).first() as any;

  if (!template) throw new HTTPException(404, { message: 'Template not found' });

  // Copy template JSON to a new session R2 key
  const sessionId = crypto.randomUUID();
  const shareToken = crypto.randomUUID();
  const r2JsonKey = `sessions/${sessionId}/session.json`;

  const obj = await c.env.R2.get(template.sessionJsonKey);
  if (obj) {
    const buf = await obj.arrayBuffer();
    await c.env.R2.put(r2JsonKey, buf, { httpMetadata: { contentType: 'application/json' } });
  }

  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO sessions (id, ownerId, workspaceId, sessionType, status, title, shareToken, r2JsonKey, createdAt, updatedAt)
     VALUES (?, ?, ?, 'steps', 'ready', ?, ?, ?, ?, ?)`
  ).bind(sessionId, user.id, user.workspaceId, template.title, shareToken, r2JsonKey, now, now).run();

  const useId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO template_uses (id, templateId, workspaceId, userId, createdAt) VALUES (?, ?, ?, ?, ?)`
  ).bind(useId, id, user.workspaceId, user.id, now).run();

  await c.env.DB.prepare(
    `UPDATE templates SET usageCount = usageCount + 1, updatedAt = ? WHERE id = ?`
  ).bind(now, id).run();

  return c.json({ sessionId, shareToken }, 201);
});

// POST /v1/templates/:id/publish — set isGlobal = 1, admin only
templates.post('/:id/publish', requireWorkspaceMembership('editor'), async (c) => {
  const user = c.get('user');
  const ws = c.get('workspace');
  const { id } = c.req.param();

  if (ws.role !== 'Admin' && ws.role !== 'Owner') {
    throw new HTTPException(403, { message: 'Only workspace admins can publish templates' });
  }

  const template = await c.env.DB.prepare(
    `SELECT id FROM templates WHERE id = ? AND workspaceId = ?`
  ).bind(id, user.workspaceId).first();

  if (!template) throw new HTTPException(404, { message: 'Template not found' });

  const now = Date.now();
  await c.env.DB.prepare(
    `UPDATE templates SET isGlobal = 1, updatedAt = ? WHERE id = ?`
  ).bind(now, id).run();

  const updated = await c.env.DB.prepare(`SELECT * FROM templates WHERE id = ?`).bind(id).first();
  return c.json(updated);
});

export default templates;
