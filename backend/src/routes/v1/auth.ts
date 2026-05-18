import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { GoogleAuthSchema } from '../../schemas/auth';
import { zValidator } from '@hono/zod-validator';
import { AuthService } from '../../services/AuthService';
import { HTTPException } from 'hono/http-exception';

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

export default auth;
