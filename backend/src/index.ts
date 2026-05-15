import { Hono } from 'hono';
import * as Sentry from '@sentry/cloudflare';
import { Env, Variables } from './types/hono';
import { errorHandler } from './middlewares/error';
import { loggerMiddleware } from './middlewares/logger';
import { corsMiddleware } from './middlewares/cors';
import legacyHandler from './monolith';

import authRoutes from './routes/v1/auth';
import workspaceRoutes from './routes/v1/workspaces';
import sessionRoutes from './routes/v1/sessions';
import assetRoutes from './routes/v1/assets';
import pipelineRoutes from './routes/v1/pipeline';

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

// Maintenance & Recovery
app.get('/v1/maintenance/recovery', async (c) => {
  const { runLocalRecovery } = await import('./db/recovery/localRecovery');
  const result = await runLocalRecovery(c.env.DB, c.env.ADMIN_EMAIL);
  return c.json(result);
});

app.get('/v1/maintenance/recover-legacy', async (c) => {
  const { runLegacyRecovery } = await import('./db/recovery/recoverLegacyAssets');
  const targetEmail = c.req.query('email') || 'karthik.upadhyay98@gmail.com';
  const dryRun = c.req.query('commit') !== 'true';
  const result = await runLegacyRecovery(c.env.DB, c.env.R2, targetEmail, dryRun);
  return c.json(result);
});

// Health check
app.get('/health', (c) => c.json({ status: 'ok', version: '1.0.0' }));

// Legacy Proxy (for non-v1 routes)
app.all('*', async (c) => {
  if (c.req.path.startsWith('/v1')) {
    return c.json({ error: 'Not Found', code: 'NOT_FOUND' }, 404);
  }
  return legacyHandler.fetch(c.req.raw, c.env, c.executionCtx);
});

// Global Error Handler
app.onError(errorHandler);

export default Sentry.withSentry(
  (env: Env) => ({ dsn: env.SENTRY_DSN }),
  {
    fetch: app.fetch,
    // Carry over scheduled and queue handlers from monolith
    async scheduled(event: any, env: Env, ctx: any) {
      return legacyHandler.scheduled(event, env, ctx);
    },
    async queue(batch: any, env: Env, ctx: any) {
      return legacyHandler.queue(batch, env, ctx);
    },
  }
);
