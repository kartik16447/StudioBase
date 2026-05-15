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

export default usage;
