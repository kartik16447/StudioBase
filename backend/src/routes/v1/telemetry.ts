import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { AuditService } from '../../services/AuditService';
import { authMiddleware } from '../../middlewares/auth';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// 1. Unified Event Reporting
router.post('/', authMiddleware(), async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const audit = new AuditService(c.env, c.executionCtx);

  await audit.record({
    eventName: body.eventName,
    userId: user.id,
    workspaceId: body.workspaceId,
    sessionId: body.sessionId,
    properties: body.properties
  });

  return c.json({ success: true });
});

// 2. Extension Debug Logs
router.post('/logs', authMiddleware(), async (c) => {
  const user = c.get('user');
  const { tag, data, sessionId } = await c.req.json();
  
  await c.env.DB.prepare(
    'INSERT INTO debug_logs (userId, tag, data, source, sessionId, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(user.id, tag, JSON.stringify(data), 'extension', sessionId || null, Date.now()).run();

  return c.json({ success: true });
});

export default router;
