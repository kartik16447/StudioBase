import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { authMiddleware } from '../../middlewares/auth';
import { workspaceMiddleware, requirePermission } from '../../middlewares/workspace';
import { getPlan } from '../../middlewares/plan';

const billing = new Hono<{ Bindings: Env; Variables: Variables }>();

billing.use('*', authMiddleware(), workspaceMiddleware());

// GET /v1/billing/plan — current plan + live usage
billing.get('/plan', async (c) => {
  const ws = c.get('workspace');
  const month = new Date().toISOString().slice(0, 7);

  const plan = await getPlan(c.env, ws.id);

  const [exportUsage, seatCount] = await Promise.all([
    c.env.DB.prepare(
      `SELECT count FROM export_usage WHERE workspaceId = ? AND month = ?`
    ).bind(ws.id, month).first<{ count: number }>().catch(() => null),

    c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM workspace_members WHERE workspaceId = ?`
    ).bind(ws.id).first<{ cnt: number }>().catch(() => null),
  ]);

  return c.json({
    plan: plan.plan,
    limits: {
      seats:     { limit: plan.plan === 'enterprise' ? null : plan.seatLimit,   current: seatCount?.cnt ?? 0 },
      exports:   { limit: plan.plan === 'enterprise' ? null : plan.exportLimit, current: exportUsage?.count ?? 0, month },
      retention: { days: plan.retentionDays },
    },
    validUntil: plan.validUntil ?? null,
  });
});

// PATCH /v1/billing/plan — admin upgrades/changes plan (manual for now, Stripe webhook later)
billing.patch('/plan', requirePermission('workspace:admin'), async (c) => {
  const ws = c.get('workspace');
  const user = c.get('user');
  const body = await c.req.json<{
    plan: 'free' | 'pro' | 'enterprise';
    seatLimit?: number;
    exportLimit?: number;
    retentionDays?: number;
    validUntil?: number | null;
  }>();

  const PLAN_DEFAULTS: Record<string, { seatLimit: number; exportLimit: number; retentionDays: number }> = {
    free:       { seatLimit: 3,   exportLimit: 10,  retentionDays: 90  },
    pro:        { seatLimit: 10,  exportLimit: 100, retentionDays: 365 },
    enterprise: { seatLimit: 999, exportLimit: 999, retentionDays: 730 },
  };

  const defaults = PLAN_DEFAULTS[body.plan] ?? PLAN_DEFAULTS.free;

  await c.env.DB.prepare(
    `INSERT INTO workspace_plans (workspaceId, plan, seatLimit, exportLimit, retentionDays, validUntil, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspaceId) DO UPDATE SET
       plan = excluded.plan,
       seatLimit = excluded.seatLimit,
       exportLimit = excluded.exportLimit,
       retentionDays = excluded.retentionDays,
       validUntil = excluded.validUntil,
       updatedAt = excluded.updatedAt`
  ).bind(
    ws.id,
    body.plan,
    body.seatLimit     ?? defaults.seatLimit,
    body.exportLimit   ?? defaults.exportLimit,
    body.retentionDays ?? defaults.retentionDays,
    body.validUntil    ?? null,
    Date.now()
  ).run();

  // Audit the plan change
  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, workspaceId, actorId, action, targetId, metadata, createdAt)
     VALUES (?, ?, ?, 'billing.plan_changed', ?, ?, ?)`
  ).bind(
    crypto.randomUUID(), ws.id, user.id, ws.id,
    JSON.stringify({ plan: body.plan }),
    Date.now()
  ).run().catch(() => {});

  return c.json({ ok: true, plan: body.plan });
});

export default billing;
