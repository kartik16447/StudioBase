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
  const success = await service.update(id, ws.id, user.id, body);
  
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
    ? `${STUDIO_BASE_URL}?share=${shareToken}`
    : null;

  return c.json({ isPublic, shareToken, shareUrl });
});

export default sessions;
