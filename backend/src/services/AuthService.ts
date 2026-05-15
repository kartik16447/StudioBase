import { Env } from '../types/hono';
import { AuditService } from './AuditService';
import { Events } from '../telemetry/events';

import { sign } from 'hono/jwt';

export class AuthService {
  private audit: AuditService;

  constructor(private env: Env, private executionCtx?: ExecutionContext) {
    this.audit = new AuditService(env, executionCtx);
  }

  async verifyGoogleToken(token: string) {
    // Try v3 first (modern)
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      // Fallback to v2
      const res2 = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res2.ok) throw new Error('AUTH_FAILED');
      return await res2.json();
    }
    return await res.json() as any;
  }

  async resolveUser(googleUser: any) {
    const { email, name, picture, sub, id } = googleUser;
    const googleSub = sub || id;
    const now = Date.now();

    // 1. Check for linked account
    const linked = await this.env.DB.prepare('SELECT userId FROM linked_accounts WHERE googleSub = ?')
      .bind(googleSub).first() as any;

    let userId: string;
    let isNewUser = false;

    if (linked) {
      userId = linked.userId;
    } else {
      // 2. Check for existing user by email
      const existing = await this.env.DB.prepare('SELECT id FROM users WHERE email = ?')
        .bind(email).first() as any;

      if (existing) {
        userId = existing.id;
      } else {
        // 3. Create new user
        isNewUser = true;
        userId = crypto.randomUUID();
        await this.env.DB.prepare(
          'INSERT INTO users (id, email, name, avatarUrl, createdAt, updatedAt, lastLoginAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(userId, email, name || email.split('@')[0], picture, now, now, now).run();

        // 4. Create default workspace
        const wsId = crypto.randomUUID();
        const slug = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + userId.slice(0, 6);
        
        await this.env.DB.batch([
          this.env.DB.prepare(
            'INSERT INTO workspaces (id, name, slug, ownerId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)'
          ).bind(wsId, `${name || email.split('@')[0]}'s Workspace`, slug, userId, now, now),
          this.env.DB.prepare(
            'INSERT INTO workspace_members (userId, workspaceId, role, joinedAt) VALUES (?, ?, ?, ?)'
          ).bind(userId, wsId, 'Owner', now),
          this.env.DB.prepare(
            'INSERT INTO usage_stats (userId, workspaceId, createdAt, updatedAt) VALUES (?, ?, ?, ?)'
          ).bind(userId, wsId, now, now)
        ]);

        // Repair orphaned sessions
        await this.env.DB.prepare('UPDATE sessions SET ownerId = ?, workspaceId = ? WHERE ownerId IS NULL AND workspaceId IS NULL')
          .bind(userId, wsId).run();
      }

      // Link account
      await this.env.DB.prepare(
        'INSERT OR IGNORE INTO linked_accounts (id, userId, email, googleSub, createdAt) VALUES (?, ?, ?, ?, ?)'
      ).bind(crypto.randomUUID(), userId, email, googleSub, now).run();
    }

    // Update last login
    await this.env.DB.prepare('UPDATE users SET lastLoginAt = ?, updatedAt = ? WHERE id = ?')
      .bind(now, now, userId).run();

    // Get active workspace
    const membership = await this.env.DB.prepare(
      'SELECT workspaceId, role FROM workspace_members WHERE userId = ? ORDER BY joinedAt ASC LIMIT 1'
    ).bind(userId).first() as any;

    await this.audit.record({
      eventName: 'user.login',
      userId,
      workspaceId: membership?.workspaceId,
      properties: { email, isNewUser, method: 'google' }
    });

    return {
      id: userId,
      email,
      name: name || email.split('@')[0],
      avatarUrl: picture,
      workspaceId: membership?.workspaceId,
      workspaceRole: membership?.role
    };
  }

  async signToken(user: any) {
    return await sign({
      id: user.id,
      email: user.email,
      workspaceId: user.workspaceId,
      role: user.workspaceRole,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 1 week
    }, this.env.ENCRYPTION_KEY);
  }
}
