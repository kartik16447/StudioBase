import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { authMiddleware } from '../../middlewares/auth';
import { workspaceMiddleware, requirePermission } from '../../middlewares/workspace';
import { AnalyticsService } from '../../services/AnalyticsService';

const analytics = new Hono<{ Bindings: Env; Variables: Variables }>();

analytics.use('*', authMiddleware(), workspaceMiddleware());

// POST /v1/analytics/events  — fire-and-forget batch ingest
analytics.post('/events', async (c) => {
  const ws = c.get('workspace');
  const user = c.get('user');
  const body = await c.req.json<{ events: any[] }>();
  const events = body?.events;
  if (!Array.isArray(events) || events.length === 0) return c.json({ ok: true });

  const service = new AnalyticsService(c.env);
  // Stamp server-side workspaceId so clients cannot spoof it
  const sanitized = events.map((e) => ({
    ...e,
    workspaceId: ws.id,
    userId: e.userId ?? user.id,
  }));
  c.executionCtx.waitUntil(service.insertEvents(sanitized).catch(console.error));
  return c.json({ ok: true });
});

// GET /v1/analytics/sops/:id  — step-level engagement for one SOP
analytics.get('/sops/:id', async (c) => {
  const ws = c.get('workspace');
  const sopId = c.req.param('id');
  const service = new AnalyticsService(c.env);
  const data = await service.getSopAnalytics(sopId, ws.id);
  return c.json(data);
});

// GET /v1/analytics/workspace  — admin-only SOP summary across workspace
analytics.get('/workspace', requirePermission('workspace:admin'), async (c) => {
  const ws = c.get('workspace');
  const service = new AnalyticsService(c.env);
  const data = await service.getWorkspaceAnalytics(ws.id);
  return c.json(data);
});

// GET /v1/analytics/views/:sopId — viewer list for a SOP (joined through sops → sessions)
analytics.get('/views/:sopId', requirePermission('workspace:admin'), async (c) => {
  const { sopId } = c.req.param();
  const { results } = await c.env.DB.prepare(
    `SELECT sv.id, sv.viewerEmail, sv.viewerFingerprint, sv.viewedAt
     FROM share_views sv
     JOIN sops sop ON sop.sessionId = sv.sessionId
     WHERE sop.id = ?
     ORDER BY sv.viewedAt DESC LIMIT 100`
  ).bind(sopId).all();
  return c.json({ views: results });
});

export default analytics;
