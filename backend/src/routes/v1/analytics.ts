import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { authMiddleware } from '../../middlewares/auth';
import { workspaceMiddleware, requirePermission } from '../../middlewares/workspace';
import { AnalyticsService, DateRange } from '../../services/AnalyticsService';
import { FeatureGateService } from '../../services/FeatureGateService';

const analytics = new Hono<{ Bindings: Env; Variables: Variables }>();

analytics.use('*', authMiddleware(), workspaceMiddleware());

// Clamp a requested date range to the plan's allowed window.
// maxDays=null means unlimited.
function resolveRange(query: Record<string, string>, maxDays: number | null, defaultDays = 30): DateRange {
  const now = Date.now();
  const until = query.until ? Math.min(parseInt(query.until, 10), now) : now;
  const requestedSince = query.since ? parseInt(query.since, 10) : now - defaultDays * 86400_000;
  const floor = maxDays !== null ? now - maxDays * 86400_000 : 0;
  const since = Math.max(requestedSince, floor);
  return { since, until };
}

// POST /v1/analytics/events  — fire-and-forget batch ingest
analytics.post('/events', async (c) => {
  const ws = c.get('workspace');
  const user = c.get('user');
  const body = await c.req.json<{ events: any[] }>();
  const events = body?.events;
  if (!Array.isArray(events) || events.length === 0) return c.json({ ok: true });

  const service = new AnalyticsService(c.env);
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

  const gates = new FeatureGateService(c.env);
  const flag = await gates.resolve(ws.id, 'analytics:date_range');
  const maxDays: number | null = flag.limits?.days ?? 7;

  const range = resolveRange(c.req.query() as Record<string, string>, maxDays);
  const service = new AnalyticsService(c.env);
  const data = await service.getSopAnalytics(sopId, ws.id, range);
  return c.json({ ...data, _range: range });
});

// GET /v1/analytics/workspace  — admin-only SOP summary across workspace
analytics.get('/workspace', requirePermission('workspace:admin'), async (c) => {
  const ws = c.get('workspace');

  const gates = new FeatureGateService(c.env);
  const [dateFlag, compFlag] = await Promise.all([
    gates.resolve(ws.id, 'analytics:date_range'),
    gates.resolve(ws.id, 'analytics:period_comparison'),
  ]);
  const maxDays: number | null = dateFlag.limits?.days ?? 7;

  const q = c.req.query() as Record<string, string>;
  const range = resolveRange(q, maxDays);
  const service = new AnalyticsService(c.env);

  const current = await service.getWorkspaceAnalytics(ws.id, range);

  // Period-over-period: run a second query over the same-length window before `since`
  let comparison: { totalSessions: number; totalViews: number } | null = null;
  if (compFlag.enabled) {
    const span = range.until - range.since;
    const prevRange: DateRange = { since: range.since - span, until: range.since };
    const prev = await service.getWorkspaceAnalytics(ws.id, prevRange);
    comparison = { totalSessions: prev.totalSessions, totalViews: prev.totalViews };
  }

  return c.json({ ...current, comparison });
});

// GET /v1/analytics/timeseries  — daily view/session buckets for sparklines
analytics.get('/timeseries', requirePermission('workspace:admin'), async (c) => {
  const ws = c.get('workspace');

  const gates = new FeatureGateService(c.env);
  const flag = await gates.resolve(ws.id, 'analytics:date_range');
  const maxDays: number | null = flag.limits?.days ?? 7;

  const range = resolveRange(c.req.query() as Record<string, string>, maxDays);
  const service = new AnalyticsService(c.env);
  const series = await service.getTimeSeries(ws.id, range);
  return c.json({ series, _range: range });
});

// GET /v1/analytics/views/:sopId — viewer list for a SOP
analytics.get('/views/:sopId', requirePermission('workspace:admin'), async (c) => {
  const { sopId } = c.req.param();
  const ws = c.get('workspace');

  const gates = new FeatureGateService(c.env);
  const viewerFlag = await gates.resolve(ws.id, 'analytics:viewer_detail');

  const selectExtra = viewerFlag.enabled
    ? ', sv.lastStepIndex, sv.stepsCompleted, sv.totalSteps, sv.completedAt'
    : '';

  const { results } = await c.env.DB.prepare(
    `SELECT sv.id, sv.viewerEmail, sv.viewerFingerprint, sv.viewedAt${selectExtra}
     FROM share_views sv
     JOIN sops sop ON sop.sessionId = sv.sessionId
     WHERE sop.id = ?
     ORDER BY sv.viewedAt DESC LIMIT 100`
  ).bind(sopId).all();
  return c.json({ views: results, viewerDetailEnabled: viewerFlag.enabled });
});

// GET /v1/analytics/export?format=csv  — flat CSV download (team+)
analytics.get('/export', requirePermission('workspace:admin'), async (c) => {
  const ws = c.get('workspace');

  const gates = new FeatureGateService(c.env);
  const [exportFlag, dateFlag] = await Promise.all([
    gates.resolve(ws.id, 'analytics:export'),
    gates.resolve(ws.id, 'analytics:date_range'),
  ]);

  if (!exportFlag.enabled) {
    return c.json({ error: 'analytics:export requires a Team or Enterprise plan' }, 403);
  }

  const maxDays: number | null = dateFlag.limits?.days ?? 7;
  const range = resolveRange(c.req.query() as Record<string, string>, maxDays);
  const service = new AnalyticsService(c.env);

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  c.executionCtx.waitUntil(
    (async () => {
      try {
        for await (const chunk of service.exportCsvRows(ws.id, range)) {
          await writer.write(encoder.encode(chunk));
        }
      } finally {
        await writer.close();
      }
    })()
  );

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="analytics-export.csv"`,
    },
  });
});

export default analytics;
