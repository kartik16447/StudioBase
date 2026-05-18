import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../../middlewares/auth';
import { workspaceMiddleware, requirePermission } from '../../middlewares/workspace';
import { 
  UpdateWorkspaceSchema, 
  CreateInviteSchema, 
  JoinWorkspaceSchema 
} from '../../schemas/workspaces';
import { WorkspaceController } from '../../controllers/WorkspaceController';
import { planGate } from '../../middlewares/plan';

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

// 3b. Get Workspace Settings (read-only)
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

workspaces.route('/', wsRoutes);

export default workspaces;
