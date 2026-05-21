import { Env } from '../types/hono';
import { AuditService } from './AuditService';
import { Events } from '../telemetry/events';

export type WorkspaceRole = 'Owner' | 'Admin' | 'Member' | 'Viewer';

export class WorkspaceService {
  private audit: AuditService;

  constructor(private env: Env, private executionCtx?: any) {
    this.audit = new AuditService(env, executionCtx);
  }

  async listByUser(userId: string) {
    const { results } = await this.env.DB.prepare(
      `SELECT w.id, w.name, w.slug, m.role, w.ownerId,
              COALESCE(wp.plan, 'free') as plan,
              COALESCE(wp.seatLimit, 3) as seatLimit,
              COALESCE(wp.exportLimit, 10) as exportLimit
       FROM workspaces w
       JOIN workspace_members m ON w.id = m.workspaceId
       LEFT JOIN workspace_plans wp ON wp.workspaceId = w.id
       WHERE m.userId = ? ORDER BY m.joinedAt ASC`
    ).bind(userId).all();
    return results;
  }

  async getById(id: string) {
    return await this.env.DB.prepare('SELECT * FROM workspaces WHERE id = ?').bind(id).first() as any;
  }

  async update(id: string, actorId: string, data: { name?: string }) {
    if (data.name) {
      await this.env.DB.prepare('UPDATE workspaces SET name = ?, updatedAt = ? WHERE id = ?')
        .bind(data.name, Date.now(), id).run();
    }

    await this.audit.record({
      eventName: 'workspace.updated',
      workspaceId: id,
      userId: actorId,
      properties: { updates: data }
    });

    return true;
  }

  async createInvite(workspaceId: string, actorId: string, role: WorkspaceRole) {
    const now = Date.now();
    
    // Check invite limit
    const { count } = await this.env.DB.prepare(
      'SELECT COUNT(*) as count FROM invites WHERE workspaceId = ? AND revokedAt IS NULL AND (expiresAt IS NULL OR expiresAt > ?)'
    ).bind(workspaceId, now).first() as any;
    
    if (count >= 10) throw new Error('LIMIT_EXCEEDED');

    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000;

    await this.env.DB.prepare(
      'INSERT INTO invites (id, workspaceId, token, role, createdAt, expiresAt, invitedBy) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, workspaceId, token, role, now, expiresAt, actorId).run();

    await this.audit.record({
      eventName: Events.WORKSPACE_INVITE,
      workspaceId,
      userId: actorId,
      properties: { role, inviteId: id }
    });

    return { token, expiresAt, role };
  }

  async join(userId: string, token: string) {
    const now = Date.now();
    const invite = await this.env.DB.prepare('SELECT * FROM invites WHERE token = ?').bind(token).first() as any;
    
    if (!invite) throw new Error('NOT_FOUND');
    if (invite.revokedAt) throw new Error('REVOKED');
    if (invite.expiresAt && invite.expiresAt < now) throw new Error('EXPIRED');

    await this.env.DB.prepare(
      'INSERT OR IGNORE INTO workspace_members (userId, workspaceId, role, joinedAt, invitedBy) VALUES (?, ?, ?, ?, ?)'
    ).bind(userId, invite.workspaceId, invite.role || 'Member', now, invite.invitedBy || null).run();

    await this.audit.record({
      eventName: 'workspace.member_joined',
      workspaceId: invite.workspaceId,
      userId: userId,
      properties: { inviteId: invite.id }
    });

    return invite.workspaceId;
  }

  async listMembers(workspaceId: string) {
    const { results } = await this.env.DB.prepare(
      `SELECT u.id as userId, u.email, u.name, u.avatarUrl, m.role, m.joinedAt FROM workspace_members m
       JOIN users u ON u.id = m.userId WHERE m.workspaceId = ?`
    ).bind(workspaceId).all();
    return results;
  }

  async removeMember(workspaceId: string, actorId: string, targetUserId: string) {
    if (actorId === targetUserId) throw new Error('CANNOT_REMOVE_SELF');

    const targetMembership = await this.env.DB.prepare(
      'SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?'
    ).bind(workspaceId, targetUserId).first() as any;

    if (!targetMembership) throw new Error('NOT_FOUND');
    if (targetMembership.role === 'Owner') throw new Error('CANNOT_REMOVE_OWNER');

    await this.env.DB.prepare('DELETE FROM workspace_members WHERE workspaceId = ? AND userId = ?')
      .bind(workspaceId, targetUserId).run();

    await this.audit.record({
      eventName: Events.WORKSPACE_MEMBER_REMOVED,
      workspaceId,
      userId: actorId,
      properties: { removedUserId: targetUserId }
    });
    
    return true;
  }

  async revokeInvite(workspaceId: string, actorId: string, inviteId: string) {
    await this.env.DB.prepare('UPDATE invites SET revokedAt = ? WHERE id = ? AND workspaceId = ?')
      .bind(Date.now(), inviteId, workspaceId).run();

    await this.audit.record({
      eventName: 'workspace.invite_revoked',
      workspaceId,
      userId: actorId,
      properties: { inviteId }
    });

    return true;
  }
}
