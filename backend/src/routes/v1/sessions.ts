import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../../middlewares/auth';
import { workspaceMiddleware, requirePermission } from '../../middlewares/workspace';
import { 
  CreateSessionSchema, 
  UpdateSessionSchema, 
  GetSessionsQuerySchema 
} from '../../schemas/sessions';
import { HTTPException } from 'hono/http-exception';
import { recordEvent, Events } from '../../telemetry/events';

import { SessionService } from '../../services/SessionService';

const sessions = new Hono<{ Bindings: Env; Variables: Variables }>();
const STUDIO_BASE_URL = 'https://studiobase-umber.vercel.app';

// Apply workspace middleware globally to all session routes
// This enforces explicit workspaceId requirement
sessions.use('*', authMiddleware(), workspaceMiddleware());

// 1. Create Session
sessions.post('/', zValidator('json', CreateSessionSchema), async (c) => {
  const user = c.get('user');
  const ws = c.get('workspace');
  const body = c.req.valid('json');
  
  const service = new SessionService(c.env, c.executionCtx);
  try {
    const result = await service.create({
      userId: user.id,
      ...body,
      workspaceId: ws.id, // Enforce context-based workspaceId
    });

    return c.json({ 
      ...result,
      studioUrl: `${STUDIO_BASE_URL}/s/${result.shareToken}` 
    }, 201);
  } catch (err: any) {
    if (err.message.startsWith('COOLDOWN:')) {
      const remaining = err.message.split(':')[1];
      throw new HTTPException(429, { message: `Wait ${remaining}s before next recording` });
    }
    throw err;
  }
});

// 2. List Sessions
sessions.get('/', zValidator('query', GetSessionsQuerySchema), async (c) => {
  const ws = c.get('workspace');
  const { limit, cursor } = c.req.valid('query');
  
  const service = new SessionService(c.env);
  const results = await service.list(ws.id, { limit, cursor });
  
  const hasMore = results.length > limit;
  const sessionsList = (hasMore ? results.slice(0, limit) : results).map((s: any) => ({
    ...s,
    studioUrl: `${STUDIO_BASE_URL}/s/${s.shareToken}`,
  }));

  const nextCursor = sessionsList.length > 0
    ? `${sessionsList[sessionsList.length - 1].createdAt}:${sessionsList[sessionsList.length - 1].id}`
    : null;

  return c.json({ sessions: sessionsList, nextCursor, hasMore, workspaceId: ws.id });
});

// 3. Get Session
sessions.get('/:id', async (c) => {
  const id = c.req.param('id');
  const ws = c.get('workspace');
  
  const service = new SessionService(c.env, c.executionCtx);
  const session = await service.getById(id, ws.id);

  if (!session) throw new HTTPException(404, { message: 'Session not found in this workspace' });

  let sessionJsonUrl: string | null = null;
  if (session.r2JsonKey && session.status !== 'deleted') {
    const origin = new URL(c.req.url).origin;
    sessionJsonUrl = `${origin}/v1/assets/${session.r2JsonKey}`;
  }

  // Attach the linked SOP id + status so the frontend can drive the editor workflow
  const sopRow = await c.env.DB
    .prepare('SELECT id, status FROM sops WHERE sessionId = ? AND workspaceId = ? LIMIT 1')
    .bind(id, ws.id)
    .first<{ id: string; status: string }>();

  return c.json({
    ...session,
    sessionJsonUrl,
    studioUrl: `${STUDIO_BASE_URL}/s/${session.shareToken}`,
    sopId: sopRow?.id ?? null,
    sopStatus: sopRow?.status ?? null,
  });
});

// 4. Update Session
sessions.patch('/:id', requirePermission('sop:edit'), zValidator('json', UpdateSessionSchema), async (c) => {
  const user = c.get('user');
  const ws = c.get('workspace');
  const id = c.req.param('id');
  const body = c.req.valid('json');
  
  const service = new SessionService(c.env, c.executionCtx);
  const success = await service.update(id, ws.id, user.id, { ...body, _editorName: (user as any).name ?? user.id });

  if (!success) throw new HTTPException(404, { message: 'Not found' });

  return c.json({ success: true });
});

// 5. Delete Session
sessions.delete('/:id', requirePermission('workspace:admin'), async (c) => {
  const user = c.get('user');
  const ws = c.get('workspace');
  const id = c.req.param('id');

  const service = new SessionService(c.env, c.executionCtx);
  const success = await service.delete(id!, ws.id!, user.id!);

  if (!success) throw new HTTPException(404, { message: 'Not found' });

  return c.json({ success: true });
});

// PATCH /v1/sessions/:id/share  — toggle public link
sessions.patch('/:id/share', requirePermission('sop:edit'), async (c) => {
  const ws = c.get('workspace');
  const id = c.req.param('id');
  const { isPublic } = await c.req.json<{ isPublic: boolean }>();

  const row = await c.env.DB
    .prepare('SELECT id, shareToken, isPublic FROM sessions WHERE id = ? AND workspaceId = ?')
    .bind(id, ws.id)
    .first<{ id: string; shareToken: string | null; isPublic: number }>();

  if (!row) return c.json({ error: 'Not found' }, 404);

  let shareToken = row.shareToken;
  if (isPublic && !shareToken) {
    shareToken = crypto.randomUUID().replace(/-/g, '');
  }

  await c.env.DB
    .prepare('UPDATE sessions SET isPublic = ?, shareToken = ?, updatedAt = ? WHERE id = ?')
    .bind(isPublic ? 1 : 0, shareToken, Date.now(), id)
    .run();

  const shareUrl = shareToken
    ? `${STUDIO_BASE_URL}/s/${shareToken}`
    : null;

  return c.json({ isPublic, shareToken, shareUrl });
});

// PATCH /v1/sessions/:id/share-formats — toggle SOP and Raw Recording visibility
sessions.patch('/:id/share-formats', requirePermission('sop:edit'), async (c) => {
  const ws   = c.get('workspace');
  const id   = c.req.param('id') as string;
  const body = await c.req.json<{ sopEnabled?: boolean; rawEnabled?: boolean }>();

  const row = await c.env.DB
    .prepare('SELECT id FROM sessions WHERE id = ? AND workspaceId = ? AND deletedAt IS NULL')
    .bind(id, ws.id)
    .first<{ id: string }>();

  if (!row) return c.json({ error: 'Not found' }, 404);

  // Build a minimal UPDATE — only touch the fields that were sent
  const updates: string[] = [];
  const values: (number | string)[] = [];

  if (typeof body.sopEnabled === 'boolean') {
    updates.push('sopEnabled = ?');
    values.push(body.sopEnabled ? 1 : 0);
  }
  if (typeof body.rawEnabled === 'boolean') {
    updates.push('rawEnabled = ?');
    values.push(body.rawEnabled ? 1 : 0);
  }

  if (updates.length === 0) return c.json({ error: 'Nothing to update' }, 400);

  updates.push('updatedAt = ?');
  values.push(Date.now());
  values.push(id);

  await c.env.DB
    .prepare(`UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  return c.json({
    sopEnabled: typeof body.sopEnabled === 'boolean' ? body.sopEnabled : undefined,
    rawEnabled: typeof body.rawEnabled === 'boolean' ? body.rawEnabled : undefined,
  });
});

// PATCH /v1/sessions/:id/enable-cinematic — deduct 1 credit and unlock cinematic sharing
// Idempotent: calling again when already enabled is free (no double charge).
sessions.patch('/:id/enable-cinematic', requirePermission('sop:edit'), async (c) => {
  const user = c.get('user');
  const ws   = c.get('workspace');
  const id   = c.req.param('id');

  const row = await c.env.DB
    .prepare('SELECT id, cinematicEnabled FROM sessions WHERE id = ? AND workspaceId = ?')
    .bind(id, ws.id)
    .first<{ id: string; cinematicEnabled: number }>();

  if (!row) return c.json({ error: 'Not found' }, 404);

  // Already enabled — no charge
  if (row.cinematicEnabled === 1) {
    return c.json({ cinematicEnabled: true, charged: false });
  }

  // Credit check
  const CINEMATIC_CREDIT_COST = 1;
  const userRecord = await c.env.DB
    .prepare('SELECT creditsBalance FROM users WHERE id = ?')
    .bind(user.id).first<{ creditsBalance: number }>();

  if ((userRecord?.creditsBalance ?? 0) < CINEMATIC_CREDIT_COST) {
    return c.json({
      error: 'INSUFFICIENT_CREDITS',
      need: CINEMATIC_CREDIT_COST,
      have: userRecord?.creditsBalance ?? 0,
    }, 402);
  }

  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE sessions SET cinematicEnabled = 1, updatedAt = ? WHERE id = ?')
      .bind(now, id),
    c.env.DB.prepare('UPDATE users SET creditsBalance = creditsBalance - ? WHERE id = ?')
      .bind(CINEMATIC_CREDIT_COST, user.id),
    c.env.DB.prepare(
      'INSERT INTO credits_ledger (id, userId, delta, reason, sessionId, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), user.id, -CINEMATIC_CREDIT_COST, 'cinematic_share', id, now),
  ]);

  return c.json({ cinematicEnabled: true, charged: true });
});

export default sessions;
