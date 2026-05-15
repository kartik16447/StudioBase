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

  // Future: Record to Cloudflare Analytics Engine
  if (c.env.ANALYTICS) {
    c.env.ANALYTICS.writeDataPoint({
      blobs: [
        c.req.method,
        c.req.path,
        c.get('user')?.id || 'anonymous',
        requestId,
      ],
      doubles: [c.res.status, latency],
      indexes: [c.req.path],
    });
  }
};
