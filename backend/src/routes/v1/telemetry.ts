import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { AuditService } from '../../services/AuditService';
import { authMiddleware } from '../../middlewares/auth';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Request Schemas ─────────────────────────────────────────────────────────

const EventSchema = z.object({
  eventName: z.string().min(1),
  workspaceId: z.string().optional(),
  sessionId: z.string().optional(),
  properties: z.record(z.string(), z.any()).optional(),
});

const LogSchema = z.object({
  tag: z.string().min(1),
  data: z.any(),
  sessionId: z.string().optional(),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

// 1. Unified Event Reporting
router.post('/', authMiddleware(), zValidator('json', EventSchema), async (c) => {
  const user = c.get('user');
  const { eventName, workspaceId, sessionId, properties } = c.req.valid('json');
  const audit = new AuditService(c.env, c.executionCtx);

  await audit.record({
    eventName,
    userId: user.id,
    workspaceId,
    sessionId,
    properties,
  });

  return c.json({ success: true });
});

// 2. Extension Debug Logs
router.post('/logs', authMiddleware(), zValidator('json', LogSchema), async (c) => {
  const user = c.get('user');
  const { tag, data, sessionId } = c.req.valid('json');

  await c.env.DB.prepare(
    'INSERT INTO debug_logs (userId, tag, data, source, sessionId, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(user.id, tag, JSON.stringify(data), 'extension', sessionId ?? null, Date.now()).run();

  return c.json({ success: true });
});

export default router;
