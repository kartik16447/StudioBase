type D1Database = import('../types/hono').Env['DB'];

export interface Notification {
  id: string;
  userId: string;
  workspaceId: string;
  type: string;
  actorId: string | null;
  actorName: string | null;
  targetId: string | null;
  metadata: string | null;
  readAt: number | null;
  createdAt: number;
}

export class NotificationService {
  constructor(private db: D1Database) {}

  async listForUser(userId: string, workspaceId: string, limit = 30): Promise<Notification[]> {
    const rows = await this.db
      .prepare(`
        SELECT n.*, u.name AS actorName
        FROM notifications n
        LEFT JOIN users u ON u.id = n.actorId
        WHERE n.userId = ? AND n.workspaceId = ?
        ORDER BY n.createdAt DESC
        LIMIT ?
      `)
      .bind(userId, workspaceId, limit)
      .all<Notification>();
    return rows.results;
  }

  async unreadCount(userId: string, workspaceId: string): Promise<number> {
    const row = await this.db
      .prepare('SELECT COUNT(*) AS cnt FROM notifications WHERE userId = ? AND workspaceId = ? AND readAt IS NULL')
      .bind(userId, workspaceId)
      .first<{ cnt: number }>();
    return row?.cnt ?? 0;
  }

  async markRead(notificationId: string, userId: string): Promise<void> {
    await this.db
      .prepare('UPDATE notifications SET readAt = ? WHERE id = ? AND userId = ?')
      .bind(Date.now(), notificationId, userId)
      .run();
  }

  async markAllRead(userId: string, workspaceId: string): Promise<void> {
    await this.db
      .prepare('UPDATE notifications SET readAt = ? WHERE userId = ? AND workspaceId = ? AND readAt IS NULL')
      .bind(Date.now(), userId, workspaceId)
      .run();
  }

  async create(data: {
    id: string;
    userId: string;
    workspaceId: string;
    type: string;
    actorId?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.db
      .prepare(`
        INSERT INTO notifications (id, userId, workspaceId, type, actorId, targetId, metadata, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        data.id,
        data.userId,
        data.workspaceId,
        data.type,
        data.actorId ?? null,
        data.targetId ?? null,
        data.metadata ? JSON.stringify(data.metadata) : null,
        Date.now(),
      )
      .run();
  }

  // Fan-out: create one notification per recipient (ignores errors per row)
  async fanOut(recipients: string[], payload: Omit<Parameters<typeof this.create>[0], 'id' | 'userId'>): Promise<void> {
    const now = Date.now();
    const meta = payload.metadata ? JSON.stringify(payload.metadata) : null;
    for (const userId of recipients) {
      const id = crypto.randomUUID();
      await this.db
        .prepare(`
          INSERT OR IGNORE INTO notifications (id, userId, workspaceId, type, actorId, targetId, metadata, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(id, userId, payload.workspaceId, payload.type, payload.actorId ?? null, payload.targetId ?? null, meta, now)
        .run();
    }
  }

  // Get workspace admins/owners for review notifications
  async getWorkspaceAdmins(workspaceId: string, excludeUserId: string): Promise<string[]> {
    const rows = await this.db
      .prepare(`
        SELECT userId FROM workspace_members
        WHERE workspaceId = ? AND role IN ('Owner', 'Admin') AND userId != ?
      `)
      .bind(workspaceId, excludeUserId)
      .all<{ userId: string }>();
    return rows.results.map((r: { userId: string }) => r.userId);
  }

  async getSopOwner(sopId: string): Promise<string | null> {
    const row = await this.db
      .prepare(`
        SELECT s.ownerId FROM sops sp
        JOIN sessions s ON s.id = sp.sessionId
        WHERE sp.id = ?
      `)
      .bind(sopId)
      .first<{ ownerId: string }>();
    return row?.ownerId ?? null;
  }
}
