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

// 4. Create Invite
wsRoutes.post('/invites', requirePermission('member:invite'), zValidator('json', CreateInviteSchema), WorkspaceController.createInvite);

// 5. Revoke Invite
wsRoutes.post('/invites/:inviteId/revoke', requirePermission('workspace:admin'), WorkspaceController.revokeInvite);

// 6. List Members
wsRoutes.get('/members', WorkspaceController.listMembers);

// 7. Remove Member
wsRoutes.delete('/members/:userId', requirePermission('workspace:admin'), WorkspaceController.removeMember);

workspaces.route('/', wsRoutes);

export default workspaces;
