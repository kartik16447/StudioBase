import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { GoogleAuthSchema } from '../../schemas/auth';
import { zValidator } from '@hono/zod-validator';
import { sign } from 'hono/jwt';
import { HTTPException } from 'hono/http-exception';
import { recordEvent } from '../../telemetry/events';

const auth = new Hono<{ Bindings: Env; Variables: Variables }>();

// 1. Google Auth (Exchange Google token for internal JWT)
auth.post('/google', zValidator('json', GoogleAuthSchema), async (c) => {
  const { accessToken } = c.req.valid('json');
  
  // 1. Verify with Google
  const googleRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!googleRes.ok) {
    throw new HTTPException(401, { message: 'Invalid Google token' });
  }

  const profile = await googleRes.json() as any;
  const { email, name, picture } = profile;
  const now = Date.now();

  // 2. Resolve/Create User
  const existingUser = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?')
    .bind(email).first() as any;
  
  let userId: string;
  let isNewUser = false;

  if (existingUser) {
    userId = existingUser.id;
    await c.env.DB.prepare('UPDATE users SET lastLogin = ?, updatedAt = ? WHERE id = ?')
      .bind(now, now, userId).run();
  } else {
    isNewUser = true;
    userId = crypto.randomUUID();
    await c.env.DB.prepare(
      'INSERT INTO users (id, email, name, avatarUrl, createdAt, updatedAt, lastLogin) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, email, name || email.split('@')[0], picture, now, now, now).run();

    // Create default workspace
    const workspaceId = crypto.randomUUID();
    const slug = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + userId.slice(0, 6);
    
    await c.env.DB.batch([
      c.env.DB.prepare(
        'INSERT INTO workspaces (id, name, slug, ownerId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(workspaceId, `${name || email.split('@')[0]}'s Workspace`, slug, userId, now, now),
      c.env.DB.prepare(
        'INSERT INTO workspace_members (userId, workspaceId, role, joinedAt) VALUES (?, ?, ?, ?)'
      ).bind(userId, workspaceId, 'Owner', now)
    ]);
  }

  // 3. Resolve Workspace Membership
  const membership = await c.env.DB.prepare(
    'SELECT workspaceId, role FROM workspace_members WHERE userId = ? ORDER BY joinedAt ASC LIMIT 1'
  ).bind(userId).first() as any;

  // 4. Generate Internal JWT
  const token = await sign({
    id: userId,
    email: email,
    workspaceId: membership?.workspaceId,
    role: membership?.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 1 week
  }, c.env.ENCRYPTION_KEY);

  // 5. Telemetry
  recordEvent(c, {
    eventName: 'user.login',
    userId: userId,
    workspaceId: membership?.workspaceId,
    properties: { isNewUser }
  }).catch(() => {});

  return c.json({ 
    token, 
    user: {
      id: userId,
      email: email,
      name: name || email.split('@')[0],
      avatarUrl: picture
    },
    workspaceId: membership?.workspaceId,
    workspaceRole: membership?.role
  });
});

export default auth;
