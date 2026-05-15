import { Env } from '../types/hono';
import { AuditService } from './AuditService';

export class ArtifactService {
  private audit: AuditService;

  constructor(private env: Env, private executionCtx?: any) {
    this.audit = new AuditService(env, executionCtx);
  }

  async getById(id: string, workspaceId: string) {
    return await this.env.DB.prepare(
      'SELECT * FROM artifacts WHERE id = ? AND workspaceId = ?'
    ).bind(id, workspaceId).first() as any;
  }

  async create(data: {
    id: string;
    sessionId: string;
    workspaceId: string;
    type: string;
    status: string;
    metadata?: Record<string, any>;
  }) {
    const { id, sessionId, workspaceId, type, status, metadata } = data;
    const now = Date.now();

    await this.env.DB.prepare(
      'INSERT INTO artifacts (id, sessionId, workspaceId, type, version, status, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, sessionId, workspaceId, type, 1, status, metadata ? JSON.stringify(metadata) : null, now).run();

    await this.audit.record({
      eventName: 'artifact.created',
      workspaceId,
      sessionId,
      properties: { artifactId: id, type }
    });

    return true;
  }

  async update(id: string, workspaceId: string, data: { status?: string; metadata?: Record<string, any> }) {
    const sets = ['version = version + 1'];
    const params: any[] = [];

    if (data.status) {
      sets.push('status = ?');
      params.push(data.status);
    }

    if (data.metadata) {
      sets.push('metadata = ?');
      params.push(JSON.stringify(data.metadata));
    }

    params.push(id, workspaceId);

    const { meta } = await this.env.DB.prepare(
      `UPDATE artifacts SET ${sets.join(', ')} WHERE id = ? AND workspaceId = ?`
    ).bind(...params).run();

    if (meta.changes > 0) {
      await this.audit.record({
        eventName: 'artifact.updated',
        workspaceId,
        properties: { artifactId: id, updates: Object.keys(data) }
      });
      return true;
    }

    return false;
  }
}
