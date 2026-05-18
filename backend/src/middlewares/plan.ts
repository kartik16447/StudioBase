import { Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { AppContext } from '../types/hono';

export type PlanFeature = 'export' | 'seat';

export interface PlanLimits {
  plan: string;
  seatLimit: number;
  exportLimit: number;
  retentionDays: number;
  validUntil: number | null;
}

const FREE_PLAN: PlanLimits = {
  plan: 'free', seatLimit: 3, exportLimit: 10, retentionDays: 90, validUntil: null,
};

export async function getPlan(env: any, workspaceId: string): Promise<PlanLimits> {
  const row = await env.DB.prepare(
    `SELECT plan, seatLimit, exportLimit, retentionDays, validUntil
     FROM workspace_plans WHERE workspaceId = ?`
  ).bind(workspaceId).first().catch(() => null) as PlanLimits | null;
  return row ?? FREE_PLAN;
}

/**
 * Gate a route behind a plan feature check.
 * Usage: router.post('/export', planGate('export'), handler)
 */
export const planGate = (feature: PlanFeature) => {
  return async (c: AppContext, next: Next) => {
    const ws = c.get('workspace');
    if (!ws) throw new HTTPException(500, { message: 'Workspace context missing' });

    const plan = await getPlan(c.env, ws.id);

    // Check plan expiry
    if (plan.validUntil && plan.validUntil < Date.now()) {
      // Downgrade to free limits silently
      Object.assign(plan, FREE_PLAN);
    }

    if (feature === 'export') {
      const month = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
      const usage = await c.env.DB.prepare(
        `SELECT count FROM export_usage WHERE workspaceId = ? AND month = ?`
      ).bind(ws.id, month).first<{ count: number }>().catch(() => null);

      const current = usage?.count ?? 0;

      // Enterprise = unlimited
      if (plan.plan !== 'enterprise' && current >= plan.exportLimit) {
        throw new HTTPException(402, {
          message: `Export limit reached (${current}/${plan.exportLimit} this month). Upgrade your plan.`,
          // @ts-ignore — custom payload
          res: new Response(JSON.stringify({
            error: 'PLAN_LIMIT',
            feature: 'export',
            current,
            limit: plan.exportLimit,
            plan: plan.plan,
          }), { status: 402, headers: { 'Content-Type': 'application/json' } }),
        });
      }

      // Increment usage (upsert)
      await c.env.DB.prepare(
        `INSERT INTO export_usage (id, workspaceId, userId, month, count)
         VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(workspaceId, month) DO UPDATE SET count = count + 1`
      ).bind(crypto.randomUUID(), ws.id, c.get('user').id, month).run().catch(() => {});
    }

    if (feature === 'seat') {
      const memberCount = await c.env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM workspace_members WHERE workspaceId = ?`
      ).bind(ws.id).first<{ cnt: number }>().catch(() => null);

      const current = memberCount?.cnt ?? 0;

      if (plan.plan !== 'enterprise' && current >= plan.seatLimit) {
        throw new HTTPException(402, {
          message: `Seat limit reached (${current}/${plan.seatLimit}). Upgrade your plan.`,
          // @ts-ignore
          res: new Response(JSON.stringify({
            error: 'PLAN_LIMIT',
            feature: 'seat',
            current,
            limit: plan.seatLimit,
            plan: plan.plan,
          }), { status: 402, headers: { 'Content-Type': 'application/json' } }),
        });
      }
    }

    await next();
  };
};
