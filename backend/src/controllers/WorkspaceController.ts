import { AppContext } from '../types/hono';
import { WorkspaceService } from '../services/WorkspaceService';
import { HTTPException } from 'hono/http-exception';

export class WorkspaceController {
  // 1. List Workspaces
  static async list(c: AppContext) {
    const user = c.get('user');
    const service = new WorkspaceService(c.env);
    const results = await service.listByUser(user.id);
    return c.json({ workspaces: results });
  }

  // 2. Join Workspace
  static async join(c: AppContext) {
    const user = c.get('user');
    const { token } = c.req.valid('json' as never);
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
  }

  // 3. Update Workspace
  static async update(c: AppContext) {
    const user = c.get('user');
    const ws = c.get('workspace');
    const body = c.req.valid('json' as never);
    const service = new WorkspaceService(c.env, c.executionCtx);
    await service.update(ws.id, user.id, body);
    return c.json({ success: true });
  }

  // 4. Create Invite
  static async createInvite(c: AppContext) {
    const user = c.get('user');
    const ws = c.get('workspace');
    const { role } = c.req.valid('json' as never);
    const service = new WorkspaceService(c.env, c.executionCtx);
    try {
      const invite = await service.createInvite(ws.id, user.id, role);
      return c.json(invite);
    } catch (err: any) {
      if (err.message === 'LIMIT_EXCEEDED') throw new HTTPException(429, { message: 'Max 10 active invites' });
      throw err;
    }
  }

  // 5. Revoke Invite
  static async revokeInvite(c: AppContext) {
    const user = c.get('user');
    const ws = c.get('workspace');
    const inviteId = c.req.param('inviteId');
    if (!inviteId) throw new HTTPException(400, { message: 'Missing inviteId' });
    const service = new WorkspaceService(c.env, c.executionCtx);
    await service.revokeInvite(ws.id, user.id, inviteId);
    return c.json({ success: true });
  }

  // 6. List Members
  static async listMembers(c: AppContext) {
    const ws = c.get('workspace');
    const service = new WorkspaceService(c.env);
    const results = await service.listMembers(ws.id);
    return c.json(results);
  }

  // 7. Remove Member
  static async removeMember(c: AppContext) {
    const currentUser = c.get('user');
    const ws = c.get('workspace');
    const targetUserId = c.req.param('userId');
    if (!targetUserId) throw new HTTPException(400, { message: 'Missing userId' });
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
  }
}
