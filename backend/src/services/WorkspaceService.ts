import { Env } from '../types/hono';
import { AuditService } from './AuditService';

export class WorkspaceService {
  private audit: AuditService;

  constructor(private env: Env, private executionCtx?: ExecutionContext) {
    this.audit = new AuditService(env, executionCtx);
  }

  async listByUser(userId: string) {
    const { results } = await this.env.DB.prepare(
      `SELECT w.id, w.name, w.slug, m.role, w.ownerId FROM workspaces w
       JOIN workspace_members m ON w.id = m.workspaceId WHERE m.userId = ? ORDER BY m.joinedAt ASC`
    ).bind(userId).all();
    return results;
  }

  async getById(id: string) {
    return await this.env.DB.prepare('SELECT * FROM workspaces WHERE id = ?').bind(id).first() as any;
  }

  async update(id: string, userId: string, data: { name?: string }) {
    const workspace = await this.getById(id);
    if (!workspace || workspace.ownerId !== userId) {
      throw new Error('FORBIDDEN');
    }
    if (data.name) {
      await this.env.DB.prepare('UPDATE workspaces SET name = ?, updatedAt = ? WHERE id = ?')
        .bind(data.name, Date.now(), id).run();
    }
    return true;
  }

  async createInvite(workspaceId: string, userId: string, role: string) {
    const workspace = await this.getById(workspaceId);
    if (!workspace || workspace.ownerId !== userId) {
      throw new Error('FORBIDDEN');
    }

    const now = Date.now();
    const { count } = await this.env.DB.prepare(
      'SELECT COUNT(*) as count FROM invites WHERE workspaceId = ? AND revokedAt IS NULL AND (expiresAt IS NULL OR expiresAt > ?)'
    ).bind(workspaceId, now).first() as any;
    
    if (count >= 10) throw new Error('LIMIT_EXCEEDED');

    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
    const inviteRole = role === 'Owner' ? 'Owner' : (role === 'Admin' ? 'Admin' : 'Member');

    await this.env.DB.prepare(
      'INSERT INTO invites (id, workspaceId, token, role, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, workspaceId, token, inviteRole, now, expiresAt).run();

    return { token, expiresAt, role: inviteRole };
  }

  async join(userId: string, token: string) {
    const now = Date.now();
    const invite = await this.env.DB.prepare('SELECT * FROM invites WHERE token = ?').bind(token).first() as any;
    
    if (!invite) throw new Error('NOT_FOUND');
    if (invite.revokedAt) throw new Error('REVOKED');
    if (invite.expiresAt && invite.expiresAt < now) throw new Error('EXPIRED');

    await this.env.DB.prepare(
      'INSERT OR IGNORE INTO workspace_members (userId, workspaceId, role, joinedAt) VALUES (?, ?, ?, ?)'
    ).bind(userId, invite.workspaceId, invite.role || 'Member', now).run();

    return invite.workspaceId;
  }

  async listMembers(workspaceId: string) {
    const { results } = await this.env.DB.prepare(
      `SELECT users.id as userId, users.email, workspace_members.role FROM workspace_members
       JOIN users ON users.id = workspace_members.userId WHERE workspace_members.workspaceId = ?`
    ).bind(workspaceId).all();
    return results;
  }

  async removeMember(workspaceId: string, currentUserId: string, targetUserId: string) {
    const membership = await this.env.DB.prepare(
      'SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?'
    ).bind(workspaceId, currentUserId).first() as any;

    if (!membership || membership.role !== 'Owner') {
      throw new Error('FORBIDDEN');
    }

    if (currentUserId === targetUserId) throw new Error('CANNOT_REMOVE_SELF');

    await this.env.DB.prepare('DELETE FROM workspace_members WHERE workspaceId = ? AND userId = ?')
      .bind(workspaceId, targetUserId).run();
    
    return true;
  }
}
