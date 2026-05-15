import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../../middlewares/auth';
import { workspaceMiddleware, requireRole } from '../../middlewares/workspace';
import { 
  UpdateWorkspaceSchema, 
  CreateInviteSchema, 
  JoinWorkspaceSchema, 
  LeaveWorkspaceSchema, 
  RevokeInviteSchema 
} from '../../schemas/workspaces';
import { HTTPException } from 'hono/http-exception';
import { recordEvent } from '../../telemetry/events';

const workspaces = new Hono<{ Bindings: Env; Variables: Variables }>();

// 1. List Workspaces (Global Context - No workspaceMiddleware)
workspaces.get('/', authMiddleware(), async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT w.id, w.name, w.slug, m.role, w.ownerId, w.planType 
     FROM workspaces w
     JOIN workspace_members m ON w.id = m.workspaceId 
     WHERE m.userId = ? ORDER BY m.joinedAt ASC`
  ).bind(user.id).all();
  
  return c.json({ workspaces: results });
});

// 2. Join Workspace (Global Context - Uses Token)
workspaces.post('/join', authMiddleware(), zValidator('json', JoinWorkspaceSchema), async (c) => {
  const user = c.get('user');
  const { token } = c.req.valid('json');
  const now = Date.now();

  const invite = await c.env.DB.prepare('SELECT * FROM invites WHERE token = ?').bind(token).first() as any;
  if (!invite) throw new HTTPException(404, { message: 'Invite invalid' });
  if (invite.revokedAt) throw new HTTPException(403, { message: 'Invite revoked' });
  if (invite.expiresAt && invite.expiresAt < now) throw new HTTPException(403, { message: 'Invite expired' });

  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO workspace_members (userId, workspaceId, role, joinedAt) VALUES (?, ?, ?, ?)'
  ).bind(user.id, invite.workspaceId, invite.role || 'Member', now).run();

  recordEvent(c, { 
    eventName: 'workspace.join', 
    workspaceId: invite.workspaceId,
    properties: { userId: user.id, role: invite.role }
  }).catch(() => {});

  return c.json({ success: true, workspaceId: invite.workspaceId });
});

// --- WORKSPACE CONTEXT ROUTES ---
const wsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
wsRoutes.use('*', authMiddleware(), workspaceMiddleware());

// 3. Update Workspace
wsRoutes.patch('/:id', requireRole('Owner'), zValidator('json', UpdateWorkspaceSchema), async (c) => {
  const workspaceId = c.req.param('id');
  const body = c.req.valid('json');
  
  if (body.name) {
    await c.env.DB.prepare('UPDATE workspaces SET name = ? WHERE id = ?')
      .bind(body.name, workspaceId)
      .run();
  }

  return c.json({ success: true });
});

// 4. Create Invite
wsRoutes.post('/invite', requireRole('Admin'), zValidator('json', CreateInviteSchema), async (c) => {
  const ws = c.get('workspace');
  const { role } = c.req.valid('json');
  
  const now = Date.now();
  const { count } = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM invites WHERE workspaceId = ? AND revokedAt IS NULL AND (expiresAt IS NULL OR expiresAt > ?)'
  ).bind(ws.id, now).first() as any;

  if (count >= 10) throw new HTTPException(429, { message: 'Max 10 active invites' });

  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
  
  await c.env.DB.prepare(
    'INSERT INTO invites (id, workspaceId, token, role, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, ws.id, token, role, now, expiresAt).run();

  return c.json({ token, expiresAt, role });
});

// 5. Leave Workspace
wsRoutes.post('/leave', zValidator('json', LeaveWorkspaceSchema), async (c) => {
  const user = c.get('user');
  const ws = c.get('workspace');
  
  if (ws.role === 'Owner') throw new HTTPException(403, { message: 'Owners cannot leave. Please transfer ownership or delete workspace.' });

  await c.env.DB.prepare('DELETE FROM workspace_members WHERE workspaceId = ? AND userId = ?')
    .bind(ws.id, user.id)
    .run();

  recordEvent(c, { eventName: 'workspace.leave', workspaceId: ws.id }).catch(() => {});

  return c.json({ success: true });
});

// 6. List Members
wsRoutes.get('/:id/members', async (c) => {
  const ws = c.get('workspace');
  
  const { results } = await c.env.DB.prepare(
    `SELECT u.id as userId, u.email, u.name, u.avatarUrl, m.role, m.joinedAt 
     FROM workspace_members m
     JOIN users u ON u.id = m.userId 
     WHERE m.workspaceId = ?`
  ).bind(ws.id).all();

  return c.json(results || []);
});

// 7. Revoke Invite
wsRoutes.post('/invite/revoke', requireRole('Admin'), zValidator('json', RevokeInviteSchema), async (c) => {
  const { inviteId } = c.req.valid('json');
  const ws = c.get('workspace');
  
  const invite = await c.env.DB.prepare('SELECT workspaceId FROM invites WHERE id = ? AND workspaceId = ?')
    .bind(inviteId, ws.id)
    .first() as any;
    
  if (!invite) throw new HTTPException(404, { message: 'Invite not found in this workspace' });

  await c.env.DB.prepare('UPDATE invites SET revokedAt = ? WHERE id = ?')
    .bind(Date.now(), inviteId)
    .run();

  return c.json({ success: true });
});

// 8. Remove Member
wsRoutes.delete('/:workspaceId/members/:userId', requireRole('Admin'), async (c) => {
  const currentUser = c.get('user');
  const ws = c.get('workspace');
  const userIdToRemove = c.req.param('userId');
  
  if (userIdToRemove === currentUser.id) {
    throw new HTTPException(400, { message: 'Cannot remove yourself. Use /leave instead.' });
  }

  // Check target's role - Admins cannot remove Owners or other Admins (optional choice, here we allow Admins to remove anyone below them)
  const targetMembership = await c.env.DB.prepare(
    'SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?'
  ).bind(ws.id, userIdToRemove).first() as any;

  if (targetMembership?.role === 'Owner' && ws.role !== 'Owner') {
    throw new HTTPException(403, { message: 'Admins cannot remove Owners' });
  }

  await c.env.DB.prepare('DELETE FROM workspace_members WHERE workspaceId = ? AND userId = ?')
    .bind(ws.id, userIdToRemove)
    .run();

  recordEvent(c, { 
    eventName: 'workspace.member_removed', 
    workspaceId: ws.id,
    properties: { removedUserId: userIdToRemove, actorUserId: currentUser.id }
  }).catch(() => {});

  return c.json({ success: true });
});

workspaces.route('/', wsRoutes);

export default workspaces;
