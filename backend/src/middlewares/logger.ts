import { Context, Next } from 'hono';

export const loggerMiddleware = async (c: Context, next: Next) => {
  const requestId = crypto.randomUUID();
  c.set('requestId', requestId);

  const start = Date.now();
  await next();
  const latency = Date.now() - start;

  // Log to console for now
  console.log(
    JSON.stringify({
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      latency,
      userId: c.get('user')?.id,
      workspaceId: c.req.query('workspaceId') || c.req.header('x-workspace-id'),
    })
  );

  if (c.env.ANALYTICS) {
    try {
      // WAE index limit is 96 bytes — use a normalized path (strip UUIDs) so deeply
      // nested routes don't blow the limit.
      const pathIndex = c.req.path
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
        .replace(/[a-z]{2,}_[A-Za-z0-9]{10,}/g, ':id')
        .slice(0, 96);
      c.env.ANALYTICS.writeDataPoint({
        blobs: [c.req.method, c.req.path, c.get('user')?.id || 'anonymous', requestId],
        doubles: [c.res.status, latency],
        indexes: [pathIndex],
      });
    } catch (e) {
      console.error('[LOGGER] WAE writeDataPoint error:', e);
    }
  }
};
