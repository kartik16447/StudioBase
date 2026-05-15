import { Context, Next } from 'hono';
import { cors } from 'hono/cors';

export const corsMiddleware = (c: Context, next: Next) => {
  const allowedOrigins = c.env.ALLOWED_ORIGINS?.split(',') || ['https://studio.studiobase.app'];
  
  if (c.env.ENVIRONMENT === 'development') {
    allowedOrigins.push('http://localhost:5173', 'http://localhost:3000');
  }

  return cors({
    origin: (origin) => {
      if (allowedOrigins.includes(origin)) return origin;
      return allowedOrigins[0];
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Workspace-Id', 'X-Session-Id'],
    exposeHeaders: ['Content-Length', 'X-Request-Id'],
    maxAge: 86400,
    credentials: true,
  })(c, next);
};
