import { Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { verify } from 'hono/jwt';
import { AppContext } from '../types/hono';
import { workspaceMiddleware, requirePermission } from './workspace';
import { Permission } from '../utils/permissions';

export const authMiddleware = (options: { optional?: boolean } = {}) => {
  return async (c: AppContext, next: Next) => {
    let authHeader = c.req.header('Authorization');
    const path = c.req.path;
    const isDev = c.env.ENVIRONMENT === 'development';
    
    // Fallback to query param for direct media links (e.g. <video src="...v1/assets/...?token=...">)
    const queryToken = c.req.query('token');
    if (!authHeader && queryToken) {
      authHeader = `Bearer ${queryToken}`;
    }

    if (!authHeader?.startsWith('Bearer ')) {
      if (options.optional) return next();
      console.log(`[DIAGNOSTIC] Auth failed for ${path}: Missing Authorization header`);
      throw new HTTPException(401, { message: 'Missing Authorization header' });
    }

    const token = authHeader.split(' ')[1];
    const now = Date.now();

    try {
      // 1. Try Internal JWT Verification (Modern Path)
      try {
        const payload = await verify(token, c.env.ENCRYPTION_KEY, 'HS256');
        if (payload && payload.id) {
          console.log(`[DIAGNOSTIC] Modern JWT Validated for ${path}. User: ${payload.id}, Workspace: ${payload.workspaceId}`);

          c.set('user', {
            id: payload.id as string,
            email: payload.email as string,
            iat: payload.iat as number | undefined,
          });
          return next();
        }
      } catch (jwtErr) {
        // Not a valid internal JWT or expired
      }

      // 2. Legacy Fallback: Google Token Verification
      // Check KV cache for legacy token
      const cached = await c.env.TOKEN_CACHE.get(`legacy:${token}`, 'json') as { user: any; expiresAt: number } | null;
      if (cached && cached.expiresAt > now) {
        c.set('user', cached.user);
        return next();
      }

      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        // [DEV BYPASS] Only activates when:
        //   1. ENVIRONMENT === 'development'
        //   2. DEV_BYPASS_EMAIL env var is explicitly set
        //   3. Token shape matches a Google token (ya29. prefix or ID token length)
        // Never executes in production — DEV_BYPASS_EMAIL is absent from production vars.
        const devBypassEmail = c.env.DEV_BYPASS_EMAIL;
        if (isDev && devBypassEmail && (token.startsWith('ya29.') || token.length > 500)) {
          console.warn(`⚠️ [DEV BYPASS] Resolving dev user: ${devBypassEmail}`);
          const devUser = await c.env.DB.prepare(
            'SELECT id, email, name, avatarUrl FROM users WHERE email = ?'
          ).bind(devBypassEmail).first() as any;
          if (!devUser) {
            throw new HTTPException(401, { message: `Dev bypass user not found in DB: ${devBypassEmail}` });
          }
          c.set('user', { id: devUser.id, email: devUser.email, name: devUser.name, avatarUrl: devUser.avatarUrl });
          return next();
        }
        console.log(`[DIAGNOSTIC] Legacy Token Validation Failed via Google API: ${res.status}`);
        throw new HTTPException(401, { message: 'Invalid token (JWT or Google)' });
      }

      const googleUser = await res.json() as any;
      console.log(`[DIAGNOSTIC] Google Token Validated. Email: ${googleUser.email}`);
      
      // Resolve user from DB
      let user = await c.env.DB.prepare('SELECT id, email, name, avatarUrl FROM users WHERE email = ?')
        .bind(googleUser.email)
        .first() as any;

      // --- AUTO-PROVISIONING (Dev Only, requires DEV_BYPASS_EMAIL to be set) ---
      // This never runs in production because DEV_BYPASS_EMAIL is absent from production vars.
      const devBypassEmail = (c.env as any).DEV_BYPASS_EMAIL as string | undefined;
      if (!user && isDev && devBypassEmail && googleUser.email === devBypassEmail) {
        console.warn(`[DEV] Auto-provisioning user: ${googleUser.email}`);
        const newUserId = crypto.randomUUID();
        await c.env.DB.prepare('INSERT INTO users (id, email, name, avatarUrl, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(newUserId, googleUser.email, googleUser.name || 'New User', googleUser.picture, now, now)
          .run();
        
        const newWsId = crypto.randomUUID();
        const slug = googleUser.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + newUserId.slice(0, 6);
        await c.env.DB.prepare('INSERT INTO workspaces (id, name, slug, ownerId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(newWsId, `${googleUser.name || googleUser.email.split('@')[0]}'s Workspace`, slug, newUserId, now, now)
          .run();
        
        await c.env.DB.prepare('INSERT INTO workspace_members (userId, workspaceId, role, joinedAt) VALUES (?, ?, ?, ?)')
          .bind(newUserId, newWsId, 'Owner', now)
          .run();

        user = { id: newUserId, email: googleUser.email, name: googleUser.name, avatarUrl: googleUser.picture };
      }

      if (!user) {
        console.log(`[DIAGNOSTIC] User ${googleUser.email} not found. Governance block.`);
        throw new HTTPException(401, { message: 'User not found' });
      }

      const userInfo = {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      };

      // Update cache
      await c.env.TOKEN_CACHE.put(
        `legacy:${token}`,
        JSON.stringify({ user: userInfo, expiresAt: now + 30 * 60 * 1000 }),
        { expirationTtl: 3600 }
      );

      c.set('user', userInfo);
      return next();
    } catch (err: any) {
      if (options.optional) return next();
      if (err instanceof HTTPException) throw err;
      console.log(`[DIAGNOSTIC] Critical Auth Failure: ${err.message}`);
      throw new HTTPException(401, { message: err.message });
    }
  };
};

export const requireWorkspaceMembership = (level: 'viewer' | 'editor') => {
  const permission: Permission = level === 'editor' ? 'sop:edit' : 'session:read';
  
  return async (c: AppContext, next: Next) => {
    // Run auth, then workspace, then permission check
    // We wrap them manually to ensure they run in sequence
    let authenticated = false;
    await authMiddleware()(c, async () => { authenticated = true; });
    if (!authenticated) return;

    let inWorkspace = false;
    await workspaceMiddleware()(c, async () => { inWorkspace = true; });
    if (!inWorkspace) return;

    await requirePermission(permission)(c, next);
  };
};
