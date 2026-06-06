export interface DocumentRow {
  id: string;
  workspaceId: string;
  parentId: string | null;
  title: string;
  emoji: string | null;
  blocks: string; // JSON string
  sortOrder: number;
  sourceSopId: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface DocumentSummary {
  id: string;
  workspaceId: string;
  parentId: string | null;
  title: string;
  emoji: string | null;
  sortOrder: number;
  isTemplate: number;
  createdBy: string;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface SearchHit {
  id: string;
  title: string;
  emoji: string | null;
  snippet: string;
  rank: number;
}

function extractText(blocks: unknown[]): string {
  const parts: string[] = [];
  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (n.type === 'text' && typeof n.text === 'string') {
      parts.push(n.text);
    }
    if (Array.isArray(n.content)) n.content.forEach(walk);
  }
  blocks.forEach(walk);
  return parts.join(' ');
}

export class DocumentService {
  constructor(private db: D1Database) {}

  async getById(id: string, workspaceId: string): Promise<DocumentRow | null> {
    const row = await this.db
      .prepare('SELECT * FROM documents WHERE id = ? AND workspaceId = ?')
      .bind(id, workspaceId)
      .first<DocumentRow>();
    return row ?? null;
  }

  async listByWorkspace(workspaceId: string): Promise<DocumentSummary[]> {
    const result = await this.db
      .prepare(
        `SELECT id, workspaceId, parentId, title, emoji, sortOrder,
                createdBy, updatedBy, createdAt, updatedAt
         FROM documents WHERE workspaceId = ? ORDER BY sortOrder ASC, createdAt ASC`
      )
      .bind(workspaceId)
      .all<DocumentSummary>();
    return result.results;
  }

  async listChildren(workspaceId: string, parentId: string): Promise<DocumentSummary[]> {
    const result = await this.db
      .prepare(
        `SELECT id, workspaceId, parentId, title, emoji, sortOrder,
                createdBy, updatedBy, createdAt, updatedAt
         FROM documents WHERE workspaceId = ? AND parentId = ? ORDER BY sortOrder ASC`
      )
      .bind(workspaceId, parentId)
      .all<DocumentSummary>();
    return result.results;
  }

  async create(params: {
    id: string;
    workspaceId: string;
    parentId: string | null;
    title: string;
    emoji: string | null;
    blocks: unknown[];
    sortOrder: number;
    userId: string;
    sourceSopId?: string | null;
  }): Promise<DocumentRow> {
    const now = Date.now();
    await this.db
      .prepare(
        `INSERT INTO documents
           (id, workspaceId, parentId, title, emoji, blocks, sortOrder, sourceSopId, createdBy, updatedBy, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        params.id,
        params.workspaceId,
        params.parentId,
        params.title,
        params.emoji,
        JSON.stringify(params.blocks),
        params.sortOrder,
        params.sourceSopId ?? null,
        params.userId,
        params.userId,
        now,
        now,
      )
      .run();
    // Best-effort FTS body update — D1 FTS5 content tables don't support
    // direct UPDATE; failures here are non-fatal, title search still works.
    const body = extractText(params.blocks);
    await this.db
      .prepare('UPDATE documents_fts SET body = ? WHERE id = ?')
      .bind(body, params.id)
      .run()
      .catch(() => {});
    return (await this.getById(params.id, params.workspaceId))!;
  }

  async update(
    id: string,
    workspaceId: string,
    userId: string,
    updates: {
      title?: string;
      emoji?: string | null;
      blocks?: unknown[];
      parentId?: string | null;
      sortOrder?: number;
    },
  ): Promise<DocumentRow> {
    const existing = await this.getById(id, workspaceId);
    if (!existing) throw new Error('Document not found');

    const now = Date.now();
    const title = updates.title ?? existing.title;
    const emoji = 'emoji' in updates ? updates.emoji : existing.emoji;
    const blocks = updates.blocks !== undefined ? JSON.stringify(updates.blocks) : existing.blocks;
    const parentId = 'parentId' in updates ? updates.parentId : existing.parentId;
    const sortOrder = updates.sortOrder ?? existing.sortOrder;

    await this.db
      .prepare(
        `UPDATE documents
         SET title = ?, emoji = ?, blocks = ?, parentId = ?, sortOrder = ?, updatedBy = ?, updatedAt = ?
         WHERE id = ? AND workspaceId = ?`
      )
      .bind(title, emoji, blocks, parentId, sortOrder, userId, now, id, workspaceId)
      .run();

    const parsedBlocks = updates.blocks !== undefined ? updates.blocks : JSON.parse(existing.blocks);
    const body = extractText(parsedBlocks);
    await this.db
      .prepare('UPDATE documents_fts SET body = ? WHERE id = ?')
      .bind(body, id)
      .run()
      .catch(() => {});

    return (await this.getById(id, workspaceId))!;
  }

  async delete(id: string, workspaceId: string): Promise<void> {
    // Recursively delete children first
    const children = await this.listChildren(workspaceId, id);
    for (const child of children) {
      await this.delete(child.id, workspaceId);
    }
    await this.db
      .prepare('DELETE FROM documents WHERE id = ? AND workspaceId = ?')
      .bind(id, workspaceId)
      .run();
  }

  async generateShareToken(id: string, workspaceId: string): Promise<string> {
    const existing = await this.getById(id, workspaceId);
    if (!existing) throw new Error('Document not found');
    if ((existing as any).shareToken) return (existing as any).shareToken as string;

    const token = crypto.randomUUID().replace(/-/g, '');
    await this.db
      .prepare('UPDATE documents SET shareToken = ? WHERE id = ? AND workspaceId = ?')
      .bind(token, id, workspaceId)
      .run();
    return token;
  }

  async getByShareToken(shareToken: string): Promise<DocumentRow | null> {
    const row = await this.db
      .prepare('SELECT * FROM documents WHERE shareToken = ?')
      .bind(shareToken)
      .first<DocumentRow>();
    return row ?? null;
  }

  async search(workspaceId: string, query: string, limit = 20): Promise<SearchHit[]> {
    const result = await this.db
      .prepare(
        `SELECT d.id, d.title, d.emoji,
                snippet(documents_fts, 3, '<mark>', '</mark>', '…', 20) AS snippet,
                bm25(documents_fts) AS rank
         FROM documents_fts
         JOIN documents d ON d.id = documents_fts.id
         WHERE documents_fts MATCH ? AND documents_fts.workspaceId = ?
         ORDER BY rank
         LIMIT ?`
      )
      .bind(`${query.replace(/["*]/g, ' ').trim()}*`, workspaceId, limit)
      .all<SearchHit>();
    return result.results;
  }

  async listTemplates(workspaceId: string): Promise<DocumentSummary[]> {
    const result = await this.db
      .prepare(
        `SELECT id, workspaceId, parentId, title, emoji, sortOrder, isTemplate,
                createdBy, updatedBy, createdAt, updatedAt
         FROM documents WHERE workspaceId = ? AND isTemplate = 1 ORDER BY updatedAt DESC`
      )
      .bind(workspaceId)
      .all<DocumentSummary>();
    return result.results;
  }

  async saveAsTemplate(id: string, workspaceId: string): Promise<void> {
    await this.db
      .prepare('UPDATE documents SET isTemplate = 1 WHERE id = ? AND workspaceId = ?')
      .bind(id, workspaceId)
      .run();
  }

  async createFromTemplate(params: {
    templateId: string;
    workspaceId: string;
    parentId: string | null;
    userId: string;
  }): Promise<DocumentRow> {
    const tmpl = await this.db
      .prepare('SELECT * FROM documents WHERE id = ? AND workspaceId = ? AND isTemplate = 1')
      .bind(params.templateId, params.workspaceId)
      .first<DocumentRow>();
    if (!tmpl) throw new Error('Template not found');

    const sortOrder = await this.nextSortOrder(params.workspaceId, params.parentId);
    return this.create({
      id: crypto.randomUUID(),
      workspaceId: params.workspaceId,
      parentId: params.parentId,
      title: tmpl.title,
      emoji: tmpl.emoji,
      blocks: JSON.parse(tmpl.blocks),
      sortOrder,
      userId: params.userId,
    });
  }

  async nextSortOrder(workspaceId: string, parentId: string | null): Promise<number> {
    const row = await this.db
      .prepare(
        `SELECT COALESCE(MAX(sortOrder), 0) + 1 AS next
         FROM documents WHERE workspaceId = ? AND parentId IS ?`
      )
      .bind(workspaceId, parentId)
      .first<{ next: number }>();
    return row?.next ?? 1;
  }
}
