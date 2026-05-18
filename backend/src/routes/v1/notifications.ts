import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { authMiddleware } from '../../middlewares/auth';
import { workspaceMiddleware } from '../../middlewares/workspace';
import { NotificationService } from '../../services/NotificationService';

const notifications = new Hono<{ Bindings: Env; Variables: Variables }>();

notifications.use('*', authMiddleware(), workspaceMiddleware());

// GET /v1/notifications  — recent 30 for current user in current workspace
notifications.get('/', async (c) => {
  const user = c.get('user');
  const ws = c.get('workspace');
  const svc = new NotificationService(c.env.DB);

  const [list, unread] = await Promise.all([
    svc.listForUser(user.id, ws.id),
    svc.unreadCount(user.id, ws.id),
  ]);

  return c.json({ notifications: list, unreadCount: unread });
});

// POST /v1/notifications/read-all
notifications.post('/read-all', async (c) => {
  const user = c.get('user');
  const ws = c.get('workspace');
  const svc = new NotificationService(c.env.DB);
  await svc.markAllRead(user.id, ws.id);
  return c.json({ ok: true });
});

// POST /v1/notifications/:id/read
notifications.post('/:id/read', async (c) => {
  const user = c.get('user');
  const notifId = c.req.param('id');
  const svc = new NotificationService(c.env.DB);
  await svc.markRead(notifId, user.id);
  return c.json({ ok: true });
});

export { notifications };
