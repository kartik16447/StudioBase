import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { authMiddleware } from '../../middlewares/auth';
import { workspaceMiddleware, requirePermission } from '../../middlewares/workspace';
import { AssetService } from '../../services/AssetService';

const usage = new Hono<{ Bindings: Env; Variables: Variables }>();

usage.use('*', authMiddleware(), workspaceMiddleware());

// 1. Get Storage Usage
usage.get('/storage', async (c) => {
  const user = c.get('user');
  const service = new AssetService(c.env);
  const stats = await service.getStorageUsage(user.id);
  return c.json(stats);
});

// 2. Get Workspace Metrics Summary
usage.get('/metrics', requirePermission('workspace:admin'), async (c) => {
  const ws = c.get('workspace');
  const { results } = await c.env.DB.prepare(
    `SELECT COUNT(*) as totalSessions, 
     SUM(CASE WHEN status='ready' THEN 1 ELSE 0 END) as readySessions,
     SUM(storageBytes) as totalStorageBytes 
     FROM sessions WHERE workspaceId = ? AND deletedAt IS NULL`
  ).bind(ws.id).all();

  return c.json({
    workspaceId: ws.id,
    metrics: results[0]
  });
});

// 3. Credit ledger summary — workspace balance, per-member and per-actionType breakdown
usage.get('/credits', requirePermission('workspace:admin'), async (c) => {
  const ws = c.get('workspace');

  const [wsCreditsRow, membersResult, byActionResult] = await Promise.all([
    // Workspace-level pool
    c.env.DB.prepare(
      'SELECT balanceCredits, monthlyAllocation, lastRefreshedAt FROM workspace_credits WHERE workspaceId = ?'
    ).bind(ws.id).first() as Promise<any>,

    // Per-member spend this billing period
    c.env.DB.prepare(
      `SELECT u.id, u.name, u.email,
              COALESCE(SUM(CASE WHEN cl.delta < 0 THEN ABS(cl.delta) ELSE 0 END), 0) as creditsSpent
       FROM workspace_members wm
       JOIN users u ON wm.userId = u.id
       LEFT JOIN credits_ledger cl ON cl.workspaceId = wm.workspaceId AND cl.userId = u.id
                                   AND cl.delta < 0
                                   AND cl.createdAt >= COALESCE(
                                     (SELECT lastRefreshedAt FROM workspace_credits WHERE workspaceId = wm.workspaceId),
                                     0
                                   )
       WHERE wm.workspaceId = ?
       GROUP BY u.id
       ORDER BY creditsSpent DESC`
    ).bind(ws.id).all() as Promise<{ results: any[] }>,

    // Per-actionType spend this billing period
    c.env.DB.prepare(
      `SELECT actionType, ABS(SUM(delta)) as creditsSpent
       FROM credits_ledger
       WHERE workspaceId = ? AND delta < 0
         AND createdAt >= COALESCE(
           (SELECT lastRefreshedAt FROM workspace_credits WHERE workspaceId = ?),
           0
         )
       GROUP BY actionType
       ORDER BY creditsSpent DESC`
    ).bind(ws.id, ws.id).all() as Promise<{ results: any[] }>,
  ]);

  const totalSpent = (membersResult.results as any[]).reduce((s, m) => s + (m.creditsSpent || 0), 0);

  return c.json({
    balanceCredits: wsCreditsRow?.balanceCredits ?? 0,
    monthlyAllocation: wsCreditsRow?.monthlyAllocation ?? 50,
    lastRefreshedAt: wsCreditsRow?.lastRefreshedAt ?? null,
    totalSpent,
    members: membersResult.results,
    byActionType: byActionResult.results,
  });
});

export default usage;
