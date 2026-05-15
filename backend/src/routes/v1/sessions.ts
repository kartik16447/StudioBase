import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../../middlewares/auth';
import { workspaceMiddleware, requireRole } from '../../middlewares/workspace';
import { 
  CreateSessionSchema, 
  UpdateSessionSchema, 
  GetSessionsQuerySchema 
} from '../../schemas/sessions';
import { HTTPException } from 'hono/http-exception';
import { recordEvent, Events } from '../../telemetry/events';

const sessions = new Hono<{ Bindings: Env; Variables: Variables }>();

const STUDIO_BASE_URL = 'https://studio.studiobase.app';

// Apply workspace middleware globally to all session routes
// This enforces explicit workspaceId requirement
sessions.use('*', authMiddleware(), workspaceMiddleware());

// 1. Create Session
sessions.post('/', zValidator('json', CreateSessionSchema), async (c) => {
  const user = c.get('user');
  const ws = c.get('workspace');
  const { sessionType, title, capturedUrl, capturedTitle, stepCount, durationMs } = c.req.valid('json');
  
  // Rate limiting / Cooldown check
  const stats = await c.env.DB.prepare(
    'SELECT lastRecordingAt FROM usage_stats WHERE userId = ? AND workspaceId = ?'
  ).bind(user.id, ws.id).first() as any;

  const now = Date.now();
  if (stats?.lastRecordingAt && now - stats.lastRecordingAt < 20000) {
    const remaining = Math.ceil((20000 - (now - stats.lastRecordingAt)) / 1000);
    throw new HTTPException(429, { message: `Wait ${remaining}s before next recording` });
  }

  const id = crypto.randomUUID();
  const shareToken = crypto.randomUUID();

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO sessions (id, ownerId, workspaceId, sessionType, status, title, capturedUrl, capturedTitle, stepCount, durationMs, shareToken, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'uploading', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, user.id, ws.id, sessionType, title || null, capturedUrl || null, capturedTitle || null, stepCount, durationMs, shareToken, now, now),
    
    c.env.DB.prepare(
      `INSERT INTO usage_stats (userId, workspaceId, lastRecordingAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(userId, workspaceId) DO UPDATE SET lastRecordingAt = excluded.lastRecordingAt, updatedAt = excluded.updatedAt`
    ).bind(user.id, ws.id, now, now, now)
  ]);

  recordEvent(c, {
    eventName: Events.SESSION_CREATED,
    workspaceId: ws.id,
    sessionId: id,
    properties: { sessionType, title }
  }).catch(() => {});

  return c.json({ 
    id, 
    shareToken, 
    studioUrl: `${STUDIO_BASE_URL}/s/${shareToken}` 
  }, 201);
});

// 2. List Sessions
sessions.get('/', zValidator('query', GetSessionsQuerySchema), async (c) => {
  const ws = c.get('workspace');
  const { limit, cursor } = c.req.valid('query');
  
  let query = 'SELECT * FROM sessions WHERE workspaceId = ? AND deletedAt IS NULL';
  const params: any[] = [ws.id];

  if (cursor) {
    const [cTime, cId] = cursor.split(':');
    query += ' AND (createdAt < ? OR (createdAt = ? AND id < ?))';
    params.push(parseInt(cTime), parseInt(cTime), cId || '');
  }
  query += ' ORDER BY createdAt DESC, id DESC LIMIT ?';
  params.push(limit + 1);

  const { results } = await c.env.DB.prepare(query).bind(...params).all();
  const hasMore = results.length > limit;
  const sessions = (hasMore ? results.slice(0, limit) : results).map((s: any) => ({
    ...s,
    studioUrl: `${STUDIO_BASE_URL}/s/${s.shareToken}`,
  }));

  const nextCursor = sessions.length > 0
    ? `${sessions[sessions.length - 1].createdAt}:${sessions[sessions.length - 1].id}`
    : null;

  return c.json({ sessions, nextCursor, hasMore, workspaceId: ws.id });
});

// 3. Get Session
sessions.get('/:id', async (c) => {
  const id = c.req.param('id');
  const ws = c.get('workspace');
  
  const session = await c.env.DB.prepare(
    'SELECT * FROM sessions WHERE (id = ? OR shareToken = ?) AND workspaceId = ? AND deletedAt IS NULL'
  ).bind(id, id, ws.id).first() as any;

  if (!session) throw new HTTPException(404, { message: 'Session not found in this workspace' });

  // Privacy check (Public sessions can be viewed by anyone, but here we are ALREADY inside workspace context)
  // If we wanted to allow public view WITHOUT workspace context, we'd need a separate route or a more complex middleware setup.
  // For now, enterprise rule: must be in workspace to use the /v1/sessions/:id route.

  let sessionJsonUrl: string | null = null;
  if (session.r2JsonKey && session.status !== 'deleted') {
    const origin = new URL(c.req.url).origin;
    sessionJsonUrl = `${origin}/assets/${session.r2JsonKey}`;
  }

  recordEvent(c, {
    eventName: 'session.fetched',
    workspaceId: ws.id,
    sessionId: session.id,
    properties: { status: session.status }
  }).catch(() => {});

  return c.json({ 
    ...session, 
    sessionJsonUrl, 
    studioUrl: `${STUDIO_BASE_URL}/s/${session.shareToken}` 
  });
});

// 4. Update Session
sessions.patch('/:id', requireRole('Member'), zValidator('json', UpdateSessionSchema), async (c) => {
  const user = c.get('user');
  const ws = c.get('workspace');
  const id = c.req.param('id');
  const body = c.req.valid('json');
  
  const session = await c.env.DB.prepare(
    'SELECT ownerId, workspaceId FROM sessions WHERE id = ? AND workspaceId = ? AND deletedAt IS NULL'
  ).bind(id, ws.id).first() as any;
  
  if (!session) throw new HTTPException(404, { message: 'Not found' });

  const now = Date.now();
  const sets = ['updatedAt = ?'];
  const params: any[] = [now];

  const fieldMap: Record<string, any> = {
    status: body.status,
    title: body.title,
    r2JsonKey: body.r2JsonKey,
    r2VideoKey: body.r2VideoKey,
    storageBytes: body.storageBytes,
    stepCount: body.stepCount,
    durationMs: body.durationMs,
    pipelinePath: body.pipelinePath,
    metadata: body.metadata ? JSON.stringify(body.metadata) : undefined,
    generatedOutputs: body.generatedOutputs ? JSON.stringify(body.generatedOutputs) : undefined,
    isPublic: typeof body.isPublic === 'boolean' ? (body.isPublic ? 1 : 0) : undefined,
  };

  for (const [col, val] of Object.entries(fieldMap)) {
    if (val !== undefined && val !== null) {
      sets.push(`${col} = ?`);
      params.push(val);
    }
  }

  params.push(id);
  await c.env.DB.prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();

  if (body.storageBytes && (body.status === 'ready' || body.status === 'uploaded')) {
    await c.env.DB.prepare(
      'UPDATE users SET r2StorageUsedBytes = r2StorageUsedBytes + ? WHERE id = ?'
    ).bind(body.storageBytes, user.id).run();
  }

  return c.json({ success: true });
});

// 5. Delete Session
sessions.delete('/:id', requireRole('Admin'), async (c) => {
  const user = c.get('user');
  const ws = c.get('workspace');
  const id = c.req.param('id');

  const session = await c.env.DB.prepare(
    'SELECT ownerId, workspaceId, r2JsonKey, r2VideoKey, storageBytes FROM sessions WHERE id = ? AND workspaceId = ?'
  ).bind(id, ws.id).first() as any;
  
  if (!session) throw new HTTPException(404, { message: 'Not found' });

  // Only Admin+ can delete, but also owners of the session can delete
  if (session.ownerId !== user.id && ws.role !== 'Owner' && ws.role !== 'Admin') {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  await c.env.DB.prepare('UPDATE sessions SET deletedAt = ? WHERE id = ?').bind(Date.now(), id).run();

  if (session.storageBytes) {
    await c.env.DB.prepare(
      'UPDATE users SET r2StorageUsedBytes = MAX(0, r2StorageUsedBytes - ?) WHERE id = ?'
    ).bind(session.storageBytes, user.id).run();
  }

  if (session.r2JsonKey) c.env.R2.delete(session.r2JsonKey).catch(() => {});
  if (session.r2VideoKey) c.env.R2.delete(session.r2VideoKey).catch(() => {});

  return c.json({ success: true });
});

export default sessions;
