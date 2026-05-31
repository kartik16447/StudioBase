import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { GoogleAuthSchema } from '../../schemas/auth';
import { zValidator } from '@hono/zod-validator';
import { AuthService } from '../../services/AuthService';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware } from '../../middlewares/auth';

const auth = new Hono<{ Bindings: Env; Variables: Variables }>();

// 1. Google Auth (Exchange Google token or auth code for internal JWT)
auth.post('/google', zValidator('json', GoogleAuthSchema), async (c) => {
  const body = c.req.valid('json');
  const service = new AuthService(c.env, c.executionCtx);

  try {
    const googleUser = 'code' in body
      ? await service.exchangeCode(body.code, body.codeVerifier, body.redirectUri)
      : await service.verifyGoogleToken(body.accessToken);
    const user = await service.resolveUser(googleUser);
    
    // 2. Sign internal JWT
    const token = await service.signToken(user);

    return c.json({ 
      token, 
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl
      },
      workspaceId: user.workspaceId,
      workspaceRole: user.workspaceRole
    });
  } catch (err: any) {
    if (err.message === 'AUTH_FAILED') {
      throw new HTTPException(401, { message: 'Invalid Google token' });
    }
    throw err;
  }
});

// 2. Get current user profile + workspace credit balance
auth.get('/me', authMiddleware(), async (c) => {
  const user = c.get('user');
  const [record, wsCredits] = await Promise.all([
    c.env.DB.prepare('SELECT id, email, name, avatarUrl FROM users WHERE id = ?')
      .bind(user.id).first() as Promise<any>,
    user.workspaceId
      ? c.env.DB.prepare(
          'SELECT balanceCredits, monthlyAllocation FROM workspace_credits WHERE workspaceId = ?'
        ).bind(user.workspaceId).first() as Promise<any>
      : Promise.resolve(null),
  ]);

  if (!record) throw new HTTPException(404, { message: 'User not found' });
  return c.json({
    id: record.id,
    email: record.email,
    name: record.name,
    avatarUrl: record.avatarUrl,
    creditsBalance: wsCredits?.balanceCredits ?? 0,
    monthlyAllocation: wsCredits?.monthlyAllocation ?? 50,
  });
});

export default auth;
