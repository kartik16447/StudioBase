import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../../middlewares/auth';
import { workspaceMiddleware, requirePermission } from '../../middlewares/workspace';
import {
  UpdateWorkspaceSchema,
  CreateInviteSchema,
  JoinWorkspaceSchema
} from '../../schemas/workspaces';
import { WorkspaceController } from '../../controllers/WorkspaceController';
import { planGate } from '../../middlewares/plan';
import { HTTPException } from 'hono/http-exception';

const UpdateMemberRoleSchema = z.object({
  role: z.enum(['Viewer', 'Member', 'Admin']),
});

const workspaces = new Hono<{ Bindings: Env; Variables: Variables }>();

// 1. List Workspaces (Global context)
workspaces.get('/', authMiddleware(), WorkspaceController.list);

// 2. Join Workspace (Global context - uses token)
workspaces.post('/join', authMiddleware(), zValidator('json', JoinWorkspaceSchema), WorkspaceController.join);

// --- WORKSPACE CONTEXT ROUTES ---
const wsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
wsRoutes.use('*', authMiddleware(), workspaceMiddleware());

// 3. Update Workspace
wsRoutes.patch('/', requirePermission('workspace:admin'), zValidator('json', UpdateWorkspaceSchema), WorkspaceController.update);

// 3b. Get Brand Config (read-only)
wsRoutes.get('/brand', async (c) => {
  const ws = c.get('workspace');
  const row = await c.env.DB.prepare(
    'SELECT brandConfig FROM workspaces WHERE id = ?'
  ).bind(ws.id).first<{ brandConfig: string | null }>();
  let brandConfig: Record<string, any> = {};
  if (row?.brandConfig) {
    try { brandConfig = JSON.parse(row.brandConfig); } catch {}
  }
  return c.json({ brandConfig });
});

// 3c. Get Workspace Settings (read-only)
wsRoutes.get('/settings', async (c) => {
  const ws = c.get('workspace');
  const row = await c.env.DB.prepare(
    'SELECT * FROM workspace_settings WHERE workspaceId = ?'
  ).bind(ws.id).first();
  return c.json({ settings: row || { workspaceId: ws.id, ssoEnabled: 0, dataRegion: 'global', retentionDays: 90 } });
});

// 4. List Pending Invites
wsRoutes.get('/invites', requirePermission('member:invite'), async (c) => {
  const ws = c.get('workspace');
  const now = Date.now();
  const rows = await c.env.DB
    .prepare(`
      SELECT i.id, i.token, i.role, i.createdAt, i.expiresAt
      FROM invites i
      WHERE i.workspaceId = ?
        AND i.revokedAt IS NULL
        AND (i.expiresAt IS NULL OR i.expiresAt > ?)
      ORDER BY i.createdAt DESC
      LIMIT 50
    `)
    .bind(ws.id, now)
    .all<{ id: string; token: string; role: string; createdAt: number; expiresAt: number | null }>();
  return c.json({ invites: rows.results });
});

// 4b. Create Invite
wsRoutes.post('/invites', requirePermission('member:invite'), planGate('seat'), zValidator('json', CreateInviteSchema), WorkspaceController.createInvite);

// 5. Revoke Invite
wsRoutes.post('/invites/:inviteId/revoke', requirePermission('workspace:admin'), WorkspaceController.revokeInvite);

// 6. List Members
wsRoutes.get('/members', WorkspaceController.listMembers);

// 7. Remove Member
wsRoutes.delete('/members/:userId', requirePermission('workspace:admin'), WorkspaceController.removeMember);

// 8. Update Member Role
wsRoutes.patch('/members/:userId', requirePermission('workspace:admin'), zValidator('json', UpdateMemberRoleSchema), async (c) => {
  const ws = c.get('workspace');
  const actor = c.get('user');
  const targetUserId = c.req.param('userId');
  const { role } = c.req.valid('json');

  if (!targetUserId) throw new HTTPException(400, { message: 'Missing userId' });

  const target = await c.env.DB.prepare(
    'SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?'
  ).bind(ws.id, targetUserId).first<{ role: string }>();

  if (!target) throw new HTTPException(404, { message: 'Member not found' });
  if (target.role === 'Owner') throw new HTTPException(403, { message: 'Cannot change Owner role' });
  if (actor.id === targetUserId) throw new HTTPException(400, { message: 'Cannot change your own role' });

  await c.env.DB.prepare(
    'UPDATE workspace_members SET role = ? WHERE workspaceId = ? AND userId = ?'
  ).bind(role, ws.id, targetUserId).run();

  return c.json({ success: true, userId: targetUserId, role });
});

workspaces.route('/', wsRoutes);

export default workspaces;
