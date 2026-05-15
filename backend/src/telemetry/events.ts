import { Context } from 'hono';
import { Env } from '../types/hono';

export interface AnalyticsEvent {
  eventName: string;
  userId?: string;
  workspaceId?: string;
  sessionId?: string;
  platform?: string;
  clientVersion?: string;
  properties?: Record<string, any>;
}

export const recordEvent = async (c: Context, event: AnalyticsEvent) => {
  const env = c.env as Env;
  const now = Date.now();
  const id = crypto.randomUUID();

  // 1. Log to D1 (Enterprise Auditability)
  c.executionCtx.waitUntil((async () => {
    try {
      await env.DB.prepare(
        `INSERT INTO analytics_events (id, eventName, userId, workspaceId, sessionId, platform, clientVersion, properties, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        event.eventName,
        event.userId || c.get('user')?.id || null,
        event.workspaceId || null,
        event.sessionId || null,
        event.platform || c.req.header('x-client-platform') || 'web',
        event.clientVersion || c.req.header('x-client-version') || '1.0.0',
        event.properties ? JSON.stringify(event.properties) : null,
        now
      ).run();
    } catch (err) {
      console.error('[TELEMETRY] D1 Error:', err);
    }

    // 2. Log to Cloudflare Analytics Engine (High-volume aggregation)
    if (env.ANALYTICS) {
      try {
        env.ANALYTICS.writeDataPoint({
          blobs: [
            event.eventName,
            event.userId || c.get('user')?.id || 'anonymous',
            event.workspaceId || 'none',
            event.sessionId || 'none',
            event.platform || 'web',
            JSON.stringify(event.properties || {}),
          ],
          doubles: [now],
          indexes: [event.eventName],
        });
        console.log(`📊 [TELEMETRY] Successfully recorded event: ${event.eventName}`);
      } catch (err) {
        console.error(`❌ [TELEMETRY] Analytics Engine Error for ${event.eventName}:`, err);
      }
    } else {
      console.warn(`⚠️ [TELEMETRY] ANALYTICS binding missing. Event ${event.eventName} skipped for AE.`);
    }
  })());
};

// Standardized Event Names
export const Events = {
  SESSION_CREATED: 'session.created',
  EXPORT_STARTED: 'export.started',
  EXPORT_COMPLETED: 'export.completed',
  EXPORT_FAILED: 'export.failed',
  RENDER_FAILED: 'render.failed',
  DECODER_FAILED: 'decoder.failed',
  UPLOAD_FAILED: 'upload.failed',
  PLAYBACK_STARTED: 'playback.started',
  EDITOR_INTERACTION: 'editor.interaction',
  QUEUE_FAILED: 'queue.failed',
  WORKSPACE_INVITE: 'workspace.invite',
  WORKSPACE_MEMBER_REMOVED: 'workspace.member_removed',
};
