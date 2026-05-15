import { Hono } from 'hono';
import * as Sentry from '@sentry/cloudflare';
import { Env, Variables } from './types/hono';
import { errorHandler } from './middlewares/error';
import { loggerMiddleware } from './middlewares/logger';
import { corsMiddleware } from './middlewares/cors';

import authRoutes from './routes/v1/auth';
import workspaceRoutes from './routes/v1/workspaces';
import sessionRoutes from './routes/v1/sessions';
import assetRoutes from './routes/v1/assets';
import pipelineRoutes from './routes/v1/pipeline';
import telemetryRoutes from './routes/v1/telemetry';
import usageRoutes from './routes/v1/usage';
import adminRoutes from './routes/v1/admin';

import { handleScheduled } from './handlers/scheduled';
import { handleQueue } from './handlers/queue';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Global Middleware
app.use('*', loggerMiddleware);
app.use('*', corsMiddleware);

// Routes (v1)
app.route('/v1/auth', authRoutes);
app.route('/v1/workspaces', workspaceRoutes);
app.route('/v1/sessions', sessionRoutes);
app.route('/v1/assets', assetRoutes);
app.route('/v1/pipeline', pipelineRoutes);
app.route('/v1/telemetry', telemetryRoutes);
app.route('/v1/usage', usageRoutes);
app.route('/v1/admin', adminRoutes);

// Maintenance & Recovery (Governance hardened)
app.get('/v1/maintenance/recovery', authMiddleware(), async (c) => {
  const user = c.get('user');
  if (user.email !== c.env.ADMIN_EMAIL) throw new HTTPException(403);
  const { runLocalRecovery } = await import('./db/recovery/localRecovery');
  const result = await runLocalRecovery(c.env.DB, c.env.ADMIN_EMAIL);
  return c.json(result);
});

// Health check
app.get('/health', (c) => c.json({ status: 'ok', version: '1.0.0', timestamp: Date.now() }));

// Catch-all for unhandled v1 routes
app.all('/v1/*', (c) => c.json({ error: 'Not Found', code: 'NOT_FOUND' }, 404));

// Global Error Handler
app.onError(errorHandler);

export default Sentry.withSentry(
  (env: Env) => ({ dsn: env.SENTRY_DSN }),
  {
    fetch: app.fetch,
    async scheduled(event: any, env: Env, ctx: any) {
      return handleScheduled(event, env, ctx);
    },
    async queue(batch: any, env: Env, ctx: any) {
      return handleQueue(batch, env, ctx);
    },
  }
);
