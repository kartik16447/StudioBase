import { Context } from 'hono';
import { Env } from '../types/hono';

export const recordAuditLog = async (
  c: Context, 
  action: string, 
  targetId?: string, 
  metadata?: Record<string, any>
) => {
  const env = c.env as Env;
  const user = c.get('user');
  
  if (!user) return;

  const id = crypto.randomUUID();
  const now = Date.now();
  const workspaceId = c.req.query('workspaceId') || c.req.header('x-workspace-id');

  try {
    await env.DB.prepare(
      `INSERT INTO audit_logs (id, actorId, workspaceId, action, targetId, metadata, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      user.id,
      workspaceId || null,
      action,
      targetId || null,
      metadata ? JSON.stringify(metadata) : null,
      now
    ).run();
  } catch (err) {
    console.error('[AUDIT] D1 Error:', err);
  }
};
