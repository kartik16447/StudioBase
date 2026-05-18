type D1Database = import('../types/hono').Env['DB'];

export interface Comment {
  id: string;
  workspaceId: string;
  sopId: string;
  stepId: string | null;
  authorId: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
  body: string;
  resolvedAt: number | null;
  resolvedBy: string | null;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export class CommentService {
  constructor(private db: D1Database) {}

  async listBySop(sopId: string, workspaceId: string): Promise<Comment[]> {
    const rows = await this.db
      .prepare(`
        SELECT
          c.id, c.workspaceId, c.sopId, c.stepId,
          c.authorId, u.name AS authorName, u.avatarUrl AS authorAvatarUrl,
          c.body, c.resolvedAt, c.resolvedBy, c.deletedAt,
          c.createdAt, c.updatedAt
        FROM comments c
        LEFT JOIN users u ON u.id = c.authorId
        WHERE c.sopId = ? AND c.workspaceId = ? AND c.deletedAt IS NULL
        ORDER BY c.createdAt ASC
      `)
      .bind(sopId, workspaceId)
      .all<Comment>();
    return rows.results;
  }

  async create(data: {
    id: string;
    workspaceId: string;
    sopId: string;
    stepId: string | null;
    authorId: string;
    body: string;
  }): Promise<Comment> {
    const now = Date.now();
    await this.db
      .prepare(`
        INSERT INTO comments (id, workspaceId, sopId, stepId, authorId, body, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(data.id, data.workspaceId, data.sopId, data.stepId ?? null, data.authorId, data.body, now, now)
      .run();

    const row = await this.db
      .prepare(`
        SELECT c.*, u.name AS authorName, u.avatarUrl AS authorAvatarUrl
        FROM comments c LEFT JOIN users u ON u.id = c.authorId
        WHERE c.id = ?
      `)
      .bind(data.id)
      .first<Comment>();
    return row!;
  }

  async resolve(commentId: string, workspaceId: string, actorId: string): Promise<Comment | null> {
    const row = await this.db
      .prepare('SELECT * FROM comments WHERE id = ? AND workspaceId = ? AND deletedAt IS NULL')
      .bind(commentId, workspaceId)
      .first<Comment>();
    if (!row) return null;

    const now = Date.now();
    const isResolved = row.resolvedAt !== null;

    await this.db
      .prepare('UPDATE comments SET resolvedAt = ?, resolvedBy = ?, updatedAt = ? WHERE id = ?')
      .bind(isResolved ? null : now, isResolved ? null : actorId, now, commentId)
      .run();

    return this.db
      .prepare(`
        SELECT c.*, u.name AS authorName, u.avatarUrl AS authorAvatarUrl
        FROM comments c LEFT JOIN users u ON u.id = c.authorId
        WHERE c.id = ?
      `)
      .bind(commentId)
      .first<Comment>();
  }

  async softDelete(commentId: string, workspaceId: string, actorId: string, actorRole: string): Promise<boolean> {
    const row = await this.db
      .prepare('SELECT * FROM comments WHERE id = ? AND workspaceId = ? AND deletedAt IS NULL')
      .bind(commentId, workspaceId)
      .first<Comment>();
    if (!row) return false;

    const canDelete = row.authorId === actorId || ['Owner', 'Admin'].includes(actorRole);
    if (!canDelete) return false;

    await this.db
      .prepare('UPDATE comments SET deletedAt = ?, updatedAt = ? WHERE id = ?')
      .bind(Date.now(), Date.now(), commentId)
      .run();
    return true;
  }

  // Get all unique commenters on a SOP (for notification fan-out)
  async getCommentersOnSop(sopId: string, excludeUserId: string): Promise<string[]> {
    const rows = await this.db
      .prepare('SELECT DISTINCT authorId FROM comments WHERE sopId = ? AND authorId != ? AND deletedAt IS NULL')
      .bind(sopId, excludeUserId)
      .all<{ authorId: string }>();
    return rows.results.map((r: { authorId: string }) => r.authorId);
  }
}
