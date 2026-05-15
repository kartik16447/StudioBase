import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../../middlewares/auth';
import { workspaceMiddleware, requireRole } from '../../middlewares/workspace';
import { 
  UpdateWorkspaceSchema, 
  CreateInviteSchema, 
  JoinWorkspaceSchema 
} from '../../schemas/workspaces';
import { HTTPException } from 'hono/http-exception';
import { WorkspaceService } from '../../services/WorkspaceService';

const workspaces = new Hono<{ Bindings: Env; Variables: Variables }>();

// 1. List Workspaces (Global context)
workspaces.get('/', authMiddleware(), async (c) => {
  const user = c.get('user');
  const service = new WorkspaceService(c.env);
  const results = await service.listByUser(user.id);
  return c.json({ workspaces: results });
});

// 2. Join Workspace (Global context - uses token)
workspaces.post('/join', authMiddleware(), zValidator('json', JoinWorkspaceSchema), async (c) => {
  const user = c.get('user');
  const { token } = c.req.valid('json');
  const service = new WorkspaceService(c.env, c.executionCtx);
  try {
    const workspaceId = await service.join(user.id, token);
    return c.json({ success: true, workspaceId });
  } catch (err: any) {
    if (err.message === 'NOT_FOUND') throw new HTTPException(404, { message: 'Invite invalid' });
    if (err.message === 'REVOKED') throw new HTTPException(403, { message: 'Invite revoked' });
    if (err.message === 'EXPIRED') throw new HTTPException(403, { message: 'Invite expired' });
    throw err;
  }
});

// --- WORKSPACE CONTEXT ROUTES ---
const wsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
wsRoutes.use('*', authMiddleware(), workspaceMiddleware());

// 3. Update Workspace
wsRoutes.patch('/', requireRole('Owner'), zValidator('json', UpdateWorkspaceSchema), async (c) => {
  const user = c.get('user');
  const ws = c.get('workspace');
  const body = c.req.valid('json');
  const service = new WorkspaceService(c.env, c.executionCtx);
  await service.update(ws.id, user.id, body);
  return c.json({ success: true });
});

// 4. Create Invite
wsRoutes.post('/invites', requireRole('Admin'), zValidator('json', CreateInviteSchema), async (c) => {
  const user = c.get('user');
  const ws = c.get('workspace');
  const { role } = c.req.valid('json');
  const service = new WorkspaceService(c.env, c.executionCtx);
  try {
    const invite = await service.createInvite(ws.id, user.id, role);
    return c.json(invite);
  } catch (err: any) {
    if (err.message === 'LIMIT_EXCEEDED') throw new HTTPException(429, { message: 'Max 10 active invites' });
    throw err;
  }
});

// 5. Revoke Invite
wsRoutes.post('/invites/:inviteId/revoke', requireRole('Admin'), async (c) => {
  const user = c.get('user');
  const ws = c.get('workspace');
  const inviteId = c.req.param('inviteId');
  const service = new WorkspaceService(c.env, c.executionCtx);
  await service.revokeInvite(ws.id, user.id, inviteId);
  return c.json({ success: true });
});

// 6. List Members
wsRoutes.get('/members', async (c) => {
  const ws = c.get('workspace');
  const service = new WorkspaceService(c.env);
  const results = await service.listMembers(ws.id);
  return c.json(results);
});

// 7. Remove Member
wsRoutes.delete('/members/:userId', requireRole('Owner'), async (c) => {
  const currentUser = c.get('user');
  const ws = c.get('workspace');
  const targetUserId = c.req.param('userId');
  const service = new WorkspaceService(c.env, c.executionCtx);
  try {
    await service.removeMember(ws.id, currentUser.id, targetUserId);
    return c.json({ success: true });
  } catch (err: any) {
    if (err.message === 'NOT_FOUND') throw new HTTPException(404, { message: 'Member not found' });
    if (err.message === 'CANNOT_REMOVE_OWNER') throw new HTTPException(403, { message: 'Cannot remove the owner' });
    if (err.message === 'CANNOT_REMOVE_SELF') throw new HTTPException(400, { message: 'Cannot remove yourself' });
    throw err;
  }
});

workspaces.route('/', wsRoutes);

export default workspaces;
