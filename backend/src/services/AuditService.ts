import { Env } from '../types/hono';
import { writeAuditLog } from '../telemetry/audit';

export class AuditService {
  constructor(private env: Env, private executionCtx?: any) {}

  async record(event: {
    eventName: string;
    userId?: string;
    workspaceId?: string;
    sessionId?: string;
    properties?: Record<string, any>;
  }) {
    const { eventName, userId, workspaceId, sessionId, properties } = event;

    // 1. Console log for local diagnostics
    console.log(`[AUDIT] ${eventName} | User: ${userId} | WS: ${workspaceId} | Session: ${sessionId}`);

    // 2. Write to D1 audit_logs (durable, queryable compliance record)
    const writeD1 = writeAuditLog(this.env, {
      actorId: userId || 'system',
      workspaceId: workspaceId ?? null,
      action: eventName,
      // Use sessionId as the primary targetId; callers can pass a richer id via properties.targetId.
      targetId: (properties?.targetId as string | undefined) ?? sessionId ?? null,
      metadata: {
        ...(properties ?? {}),
        // Always record the sessionId in metadata even when it's also the targetId.
        ...(sessionId ? { sessionId } : {}),
      },
    });

    // 3. Emit to Cloudflare Analytics Engine (high-volume aggregation)
    if (this.env.ANALYTICS) {
      try {
        const datapoint = {
          indexes: [workspaceId || 'anonymous'],
          blobs: [
            eventName,
            userId || 'anonymous',
            sessionId || 'none',
            JSON.stringify(properties || {}),
            '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
          ],
          doubles: [
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          ],
        };

        if (this.executionCtx) {
          // Run both the D1 write and the AE write non-blocking so they don't
          // delay the primary request. waitUntil keeps the Worker alive until done.
          this.executionCtx.waitUntil(
            Promise.all([
              writeD1,
              Promise.resolve(this.env.ANALYTICS.writeDataPoint(datapoint)),
            ])
          );
        } else {
          // Synchronous context (e.g. queue handler) — await both.
          await writeD1;
          this.env.ANALYTICS.writeDataPoint(datapoint);
        }
        return; // D1 write is handled inside the waitUntil branch above.
      } catch (err) {
        console.error('[AUDIT] Analytics Engine error:', err);
      }
    }

    // Fallback: if ANALYTICS binding is absent, still ensure D1 is written.
    await writeD1;
  }
}
