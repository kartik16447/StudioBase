import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { authMiddleware } from '../../middlewares/auth';
import { workspaceMiddleware } from '../../middlewares/workspace';
import { FeatureGateService } from '../../services/FeatureGateService';

const features = new Hono<{ Bindings: Env; Variables: Variables }>();

features.use('*', authMiddleware(), workspaceMiddleware());

// GET /v1/features — full resolved feature map for the current workspace
// Called once on auth; result stored in frontend Zustand store.
features.get('/', async (c) => {
  const ws = c.get('workspace');
  const service = new FeatureGateService(c.env);
  const flags = await service.resolveAll(ws.id);
  return c.json({ features: flags });
});

// POST /v1/features/override — admin-only: set a per-workspace override
// Body: { featureKey, enabled, expiresAt?, overrideReason? }
features.post('/override', async (c) => {
  const ws = c.get('workspace');
  const actor = c.get('user');

  // Only workspace admins/owners can set overrides
  const membership = await c.env.DB.prepare(
    'SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?'
  ).bind(ws.id, actor.id).first<{ role: string }>();

  if (!membership || !['Owner', 'Admin'].includes(membership.role)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const { featureKey, enabled, expiresAt, overrideReason } = await c.req.json<{
    featureKey: string;
    enabled: boolean;
    expiresAt?: number;
    overrideReason?: string;
  }>();

  if (!featureKey || enabled === undefined) {
    return c.json({ error: 'featureKey and enabled are required' }, 400);
  }

  await c.env.DB.prepare(
    `INSERT INTO workspace_feature_overrides
       (workspaceId, featureKey, enabled, overrideReason, expiresAt, grantedBy, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspaceId, featureKey) DO UPDATE SET
       enabled = excluded.enabled,
       overrideReason = excluded.overrideReason,
       expiresAt = excluded.expiresAt,
       grantedBy = excluded.grantedBy,
       createdAt = excluded.createdAt`
  ).bind(
    ws.id, featureKey, enabled ? 1 : 0,
    overrideReason ?? null, expiresAt ?? null,
    actor.id, Date.now()
  ).run();

  return c.json({ ok: true, workspaceId: ws.id, featureKey, enabled });
});

export default features;
