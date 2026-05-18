import { AppContext } from '../types/hono';

export class AuditLogController {
  static async list(c: AppContext) {
    const ws = c.get('workspace');
    if (!ws) return c.json({ error: 'Workspace missing' }, 400);

    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const actorId = c.req.query('actorId');

    let query = 'SELECT * FROM audit_logs WHERE workspaceId = ?';
    const params: any[] = [ws.id];

    if (startDate) {
      query += ' AND timestamp >= ?';
      params.push(parseInt(startDate));
    }
    if (endDate) {
      query += ' AND timestamp <= ?';
      params.push(parseInt(endDate));
    }
    if (actorId) {
      query += ' AND actorId = ?';
      params.push(actorId);
    }

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const { results } = await c.env.DB.prepare(query).bind(...params).all();

    return c.json({ data: results });
  }

  static async create(c: AppContext) {
    const ws = c.get('workspace');
    const user = c.get('user');
    const { action, targetId, metadata } = await c.req.json();

    if (!ws) return c.json({ error: 'Workspace context missing' }, 400);

    const id = crypto.randomUUID();
    const timestamp = Date.now();

    await c.env.DB.prepare(
      'INSERT INTO audit_logs (id, workspaceId, actorId, action, targetId, timestamp, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      id,
      ws.id,
      user.id,
      action,
      targetId,
      timestamp,
      JSON.stringify(metadata || {})
    ).run();

    return c.json({ success: true, id }, 201);
  }
}
