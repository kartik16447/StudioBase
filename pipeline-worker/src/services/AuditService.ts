export class AuditService {
  constructor(private env: any, private executionCtx?: ExecutionContext) {}

  async record(event: {
    eventName: string;
    userId?: string;
    workspaceId?: string;
    sessionId?: string;
    properties?: Record<string, any>;
  }) {
    const { eventName, userId, workspaceId, sessionId, properties } = event;
    
    console.log(`[AUDIT] ${eventName} | User: ${userId} | WS: ${workspaceId} | Session: ${sessionId}`);

    if (this.env.ANALYTICS) {
      try {
        const datapoint = {
          indexes: [workspaceId || 'anonymous'],
          blobs: [
            eventName,
            userId || 'anonymous',
            sessionId || 'none',
            JSON.stringify(properties || {}),
            '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
          ],
          doubles: [
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
          ]
        };

        if (this.executionCtx) {
          this.executionCtx.waitUntil(Promise.resolve(this.env.ANALYTICS.writeDataPoint(datapoint)));
        } else {
          this.env.ANALYTICS.writeDataPoint(datapoint);
        }
      } catch (err) {
        console.error('[AUDIT] Failed to write datapoint:', err);
      }
    }
  }
}
