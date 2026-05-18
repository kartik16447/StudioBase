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
      // WAE index limit is 96 bytes — truncate to be safe.
      const waeIndex = (workspaceId || 'anonymous').slice(0, 96);
      const datapoint = {
        indexes: [waeIndex],
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

      const safeWriteWAE = () => {
        try {
          const result: unknown = this.env.ANALYTICS.writeDataPoint(datapoint);
          // Swallow async rejections too (writeDataPoint may return a Promise)
          if (result != null && typeof (result as any).then === 'function') {
            (result as Promise<void>).catch((e: unknown) => {
              console.error('[AUDIT] WAE async error:', e);
            });
          }
        } catch (e) {
          console.error('[AUDIT] WAE sync error:', e);
        }
      };

      if (this.executionCtx) {
        this.executionCtx.waitUntil(
          writeD1.then(() => safeWriteWAE()).catch((e: unknown) => {
            console.error('[AUDIT] waitUntil error:', e);
          })
        );
        return;
      } else {
        await writeD1;
        safeWriteWAE();
        return;
      }
    }

    // Fallback: if ANALYTICS binding is absent, still ensure D1 is written.
    await writeD1;
  }

  static async record(env: Env, event: {
    actorId: string;
    workspaceId: string;
    event: string;
    metadata?: Record<string, any>;
  }) {
    const service = new AuditService(env);
    await service.record({
      eventName: event.event,
      userId: event.actorId,
      workspaceId: event.workspaceId,
      properties: event.metadata,
    });
  }
}
