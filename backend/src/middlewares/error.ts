import { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import * as Sentry from '@sentry/cloudflare';

export const errorHandler = (err: Error, c: Context) => {
  console.error('[ERROR]', err);

  // Report to Sentry
  if (c.env.SENTRY_DSN) {
    Sentry.captureException(err);
  }

  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  const status = (err as any).status || 500;
  const code = (err as any).code || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'An unexpected error occurred';

  return c.json(
    {
      success: false,
      error: {
        code,
        message,
        requestId: c.get('requestId'),
      },
    },
    status
  );
};
