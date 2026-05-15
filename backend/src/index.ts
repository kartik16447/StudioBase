import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import * as Sentry from '@sentry/cloudflare';
import { Env, Variables } from './types/hono';
import { errorHandler } from './middlewares/error';
import { loggerMiddleware } from './middlewares/logger';
import { corsMiddleware } from './middlewares/cors';
import { authMiddleware } from './middlewares/auth';

import authRoutes from './routes/v1/auth';
import workspaceRoutes from './routes/v1/workspaces';
import sessionRoutes from './routes/v1/sessions';
import assetRoutes from './routes/v1/assets';
import pipelineRoutes from './routes/v1/pipeline';
import telemetryRoutes from './routes/v1/telemetry';
import usageRoutes from './routes/v1/usage';
import adminRoutes from './routes/v1/admin';
import auditLogRoutes from './routes/v1/audit-logs';
import ssoRoutes from './routes/v1/sso';

import { handleScheduled } from './handlers/scheduled';
import { handleQueue } from './handlers/queue';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Global Middleware
app.use('*', loggerMiddleware);
app.use('*', corsMiddleware);

// --- V1 API Router ---
const v1 = new Hono<{ Bindings: Env; Variables: Variables }>();

v1.route('/auth', authRoutes);
v1.route('/workspaces', workspaceRoutes);
v1.route('/sessions', sessionRoutes);
v1.route('/assets', assetRoutes);
v1.route('/pipeline', pipelineRoutes);
v1.route('/telemetry', telemetryRoutes);
v1.route('/usage', usageRoutes);
v1.route('/admin', adminRoutes);
v1.route('/audit-logs', auditLogRoutes);
v1.route('/sso', ssoRoutes);

// Maintenance & Recovery (Governance hardened)
v1.get('/maintenance/recovery', authMiddleware(), async (c) => {
  const user = c.get('user');
  if (user.email !== c.env.ADMIN_EMAIL) throw new HTTPException(403);
  const { runLocalRecovery } = await import('./db/recovery/localRecovery');
  const result = await runLocalRecovery(c.env.DB, c.env.ADMIN_EMAIL);
  return c.json(result);
});

// Catch-all for unhandled v1 routes
v1.all('/*', (c) => c.json({ error: 'Not Found', code: 'NOT_FOUND' }, 404));

// Mount v1 router onto the root app
app.route('/v1', v1);

// --- Root level routes ---
// Health check
app.get('/health', (c) => c.json({ status: 'ok', version: '1.0.0', timestamp: Date.now() }));

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
