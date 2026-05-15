import { Env } from '../types/hono';
import { AuditService } from './AuditService';
import { Events } from '../telemetry/events';
import { SessionEnvelopeSchema } from '../schemas/SopSchema';

export class SessionService {
  private audit: AuditService;

  constructor(private env: Env, private executionCtx?: any) {
    this.audit = new AuditService(env, executionCtx);
  }

  async create(data: {
    userId: string;
    workspaceId: string;
    sessionType?: string;
    title?: string;
    capturedUrl?: string;
    capturedTitle?: string;
    stepCount?: number;
    durationMs?: number;
  }) {
    const { userId, workspaceId, sessionType = 'steps', title, capturedUrl, capturedTitle, stepCount = 0, durationMs = 0 } = data;
    
    // 1. Cooldown check
    const stats = await this.env.DB.prepare(
      'SELECT lastRecordingAt FROM usage_stats WHERE userId = ? AND workspaceId = ?'
    ).bind(userId, workspaceId).first() as any;

    const now = Date.now();
    if (stats?.lastRecordingAt && now - stats.lastRecordingAt < 20000) {
      const remaining = Math.ceil((20000 - (now - stats.lastRecordingAt)) / 1000);
      throw new Error(`COOLDOWN:${remaining}`);
    }

    const id = crypto.randomUUID();
    const shareToken = crypto.randomUUID();

    // 2. Insert session and update stats
    await this.env.DB.batch([
      this.env.DB.prepare(
        `INSERT INTO sessions (id, ownerId, workspaceId, sessionType, status, title, capturedUrl, capturedTitle, stepCount, durationMs, shareToken, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 'uploading', ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(id, userId, workspaceId, sessionType, title || null, capturedUrl || null, capturedTitle || null, stepCount, durationMs, shareToken, now, now),
      
      this.env.DB.prepare(
        `INSERT INTO usage_stats (userId, workspaceId, lastRecordingAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(userId, workspaceId) DO UPDATE SET lastRecordingAt = excluded.lastRecordingAt, updatedAt = excluded.updatedAt`
      ).bind(userId, workspaceId, now, now, now)
    ]);

    await this.audit.record({
      eventName: Events.SESSION_CREATED,
      userId,
      workspaceId,
      sessionId: id,
      properties: { sessionType, title }
    });

    return { id, shareToken };
  }

  async getById(id: string, workspaceId: string) {
    return await this.env.DB.prepare(
      'SELECT * FROM sessions WHERE (id = ? OR shareToken = ?) AND workspaceId = ? AND deletedAt IS NULL'
    ).bind(id, id, workspaceId).first() as any;
  }

  async getEnvelope(id: string, workspaceId: string) {
    const session = await this.getById(id, workspaceId);
    if (!session || !session.r2JsonKey) return null;
    
    const obj = await this.env.R2.get(session.r2JsonKey);
    if (!obj) return null;

    try {
      const data = await obj.json();
      return SessionEnvelopeSchema.parse(data);
    } catch (err) {
      console.error(`[SCHEMA_DRIFT] Session ${id} envelope failed validation:`, err);
      throw err;
    }
  }

  async list(workspaceId: string, options: { limit?: number; cursor?: string } = {}) {
    const limit = options.limit || 20;
    const { cursor } = options;
    
    let query = 'SELECT * FROM sessions WHERE workspaceId = ? AND deletedAt IS NULL';
    const params: any[] = [workspaceId];

    if (cursor) {
      const [cTime, cId] = cursor.split(':');
      query += ' AND (createdAt < ? OR (createdAt = ? AND id < ?))';
      params.push(parseInt(cTime), parseInt(cTime), cId || '');
    }
    query += ' ORDER BY createdAt DESC, id DESC LIMIT ?';
    params.push(limit + 1);

    const { results } = await this.env.DB.prepare(query).bind(...params).all();
    return results;
  }

  async update(id: string, workspaceId: string, userId: string, data: any) {
    const now = Date.now();
    const sets = ['updatedAt = ?'];
    const params: any[] = [now];

    const fieldMap: Record<string, any> = {
      status: data.status,
      title: data.title,
      r2JsonKey: data.r2JsonKey,
      r2VideoKey: data.r2VideoKey,
      storageBytes: data.storageBytes,
      stepCount: data.stepCount,
      durationMs: data.durationMs,
      pipelinePath: data.pipelinePath,
      metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
      generatedOutputs: data.generatedOutputs ? JSON.stringify(data.generatedOutputs) : undefined,
      isPublic: typeof data.isPublic === 'boolean' ? (data.isPublic ? 1 : 0) : undefined,
    };

    for (const [col, val] of Object.entries(fieldMap)) {
      if (val !== undefined && val !== null) {
        sets.push(`${col} = ?`);
        params.push(val);
      }
    }

    params.push(id, workspaceId);
    await this.env.DB.prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE id = ? AND workspaceId = ?`).bind(...params).run();

    if (data.storageBytes && (data.status === 'ready' || data.status === 'uploaded')) {
      await this.env.DB.prepare(
        'UPDATE users SET r2StorageUsedBytes = r2StorageUsedBytes + ? WHERE id = ?'
      ).bind(data.storageBytes, userId).run();
    }
    
    return true;
  }

  async delete(id: string, workspaceId: string, userId: string) {
    const session = await this.env.DB.prepare(
      'SELECT ownerId, storageBytes, r2JsonKey, r2VideoKey FROM sessions WHERE id = ? AND workspaceId = ?'
    ).bind(id, workspaceId).first() as any;
    
    if (!session) return false;

    await this.env.DB.prepare('UPDATE sessions SET deletedAt = ? WHERE id = ?').bind(Date.now(), id).run();

    if (session.storageBytes) {
      await this.env.DB.prepare(
        'UPDATE users SET r2StorageUsedBytes = MAX(0, r2StorageUsedBytes - ?) WHERE id = ?'
      ).bind(session.storageBytes, userId).run();
    }

    if (session.r2JsonKey) this.env.R2.delete(session.r2JsonKey).catch(() => {});
    if (session.r2VideoKey) this.env.R2.delete(session.r2VideoKey).catch(() => {});

    return true;
  }
}
