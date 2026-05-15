import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { authMiddleware } from '../../middlewares/auth';
import { HTTPException } from 'hono/http-exception';

const admin = new Hono<{ Bindings: Env; Variables: Variables }>();

admin.use('*', authMiddleware(), async (c, next) => {
  const user = c.get('user');
  if (user.email !== c.env.ADMIN_EMAIL) {
    throw new HTTPException(403, { message: 'Admin access required' });
  }
  await next();
});

// 1. Global Metrics
admin.get('/metrics', async (c) => {
  const [users, sessions, ready] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first() as any,
    c.env.DB.prepare('SELECT COUNT(*) as count FROM sessions WHERE deletedAt IS NULL').first() as any,
    c.env.DB.prepare('SELECT COUNT(*) as count FROM sessions WHERE status="ready" AND deletedAt IS NULL').first() as any,
  ]);
  
  return c.json({
    totalUsers: users?.count || 0,
    totalSessions: sessions?.count || 0,
    readySessions: ready?.count || 0,
    timestamp: Date.now()
  });
});

export default admin;
