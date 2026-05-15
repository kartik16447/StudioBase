import { Context } from 'hono';
import { Env } from '../types/hono';

// ─── Context-free D1 writer ───────────────────────────────────────────────────
// Used by AuditService (which has no Hono Context) to write directly to D1.

export interface AuditLogEntry {
  actorId: string;
  workspaceId?: string | null;
  action: string;
  targetId?: string | null;
  metadata?: Record<string, any> | null;
  timestamp?: number;
}

export const writeAuditLog = async (env: Env, entry: AuditLogEntry): Promise<void> => {
  const id = crypto.randomUUID();
  const now = entry.timestamp ?? Date.now();

  try {
    await env.DB.prepare(
      `INSERT INTO audit_logs (id, actorId, workspaceId, action, targetId, metadata, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      entry.actorId,
      entry.workspaceId ?? null,
      entry.action,
      entry.targetId ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      now
    ).run();
  } catch (err) {
    // Audit log failures must never crash the primary request flow.
    console.error('[AUDIT] D1 write error:', err);
  }
};

// ─── Context-aware helper (kept for route-level callers) ─────────────────────

export const recordAuditLog = async (
  c: Context,
  action: string,
  targetId?: string,
  metadata?: Record<string, any>
) => {
  const env = c.env as Env;
  const user = c.get('user');

  if (!user) return;

  const workspaceId = c.req.query('workspaceId') || c.req.header('x-workspace-id');

  await writeAuditLog(env, {
    actorId: user.id,
    workspaceId: workspaceId || null,
    action,
    targetId: targetId || null,
    metadata: metadata || null,
  });
};
