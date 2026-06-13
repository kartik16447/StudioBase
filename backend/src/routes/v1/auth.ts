import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { GoogleAuthSchema } from '../../schemas/auth';
import { zValidator } from '@hono/zod-validator';
import { AuthService } from '../../services/AuthService';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware } from '../../middlewares/auth';
import { TOTPService } from '../../services/TOTPService';

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
  // Prefer workspaceId from JWT; fall back to header (handles stale tokens issued before workspace was linked)
  const resolvedWorkspaceId = user.workspaceId || c.req.header('x-workspace-id');
  const [record, wsCredits] = await Promise.all([
    c.env.DB.prepare('SELECT id, email, name, avatarUrl FROM users WHERE id = ?')
      .bind(user.id).first() as Promise<any>,
    resolvedWorkspaceId
      ? c.env.DB.prepare(
          'SELECT balanceCredits, monthlyAllocation FROM workspace_credits WHERE workspaceId = ?'
        ).bind(resolvedWorkspaceId).first() as Promise<any>
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

// 3. MFA Setup — generate TOTP secret, store pending (unverified) record
auth.post('/mfa/setup', authMiddleware(), async (c) => {
  const user = c.get('user');
  const workspaceId = c.req.header('x-workspace-id') || (user as any).workspaceId;
  if (!workspaceId) throw new HTTPException(400, { message: 'x-workspace-id header required' });

  // Delete any unverified pending record so this is idempotent
  await c.env.DB.prepare(
    'DELETE FROM user_mfa_secrets WHERE userId = ? AND workspaceId = ? AND verifiedAt IS NULL'
  ).bind(user.id, workspaceId).run().catch(() => {});

  const secret = TOTPService.generateSecret();
  const backupCodes = TOTPService.generateBackupCodes();
  const id = crypto.randomUUID();
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO user_mfa_secrets (id, userId, workspaceId, secret, backupCodes, verifiedAt, createdAt)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`
  ).bind(id, user.id, workspaceId, secret, JSON.stringify(backupCodes), now).run();

  return c.json({
    secret,
    uri: TOTPService.otpauthUri(secret, user.email),
    backupCodes,
  });
});

// 4. MFA Verify — confirm TOTP code and issue a new JWT with mfaVerified:true
auth.post('/mfa/verify', authMiddleware(), async (c) => {
  const user = c.get('user');
  const workspaceId = c.req.header('x-workspace-id') || (user as any).workspaceId;
  const { code } = await c.req.json<{ code: string }>();

  if (!workspaceId) throw new HTTPException(400, { message: 'x-workspace-id header required' });
  if (!code) throw new HTTPException(400, { message: 'code required' });

  const row = await c.env.DB.prepare(
    'SELECT id, secret FROM user_mfa_secrets WHERE userId = ? AND workspaceId = ?'
  ).bind(user.id, workspaceId).first<{ id: string; secret: string }>().catch(() => null);

  if (!row) throw new HTTPException(404, { message: 'MFA not set up for this user' });

  // Check backup code first (plain hex match, single-use)
  let verified = false;
  const backupRow = await c.env.DB.prepare(
    'SELECT backupCodes FROM user_mfa_secrets WHERE id = ?'
  ).bind(row.id).first<{ backupCodes: string | null }>().catch(() => null);
  let backupCodes: string[] = [];
  if (backupRow?.backupCodes) {
    try { backupCodes = JSON.parse(backupRow.backupCodes); } catch {}
  }
  const backupIdx = backupCodes.indexOf(code.trim().toLowerCase());
  if (backupIdx >= 0) {
    backupCodes.splice(backupIdx, 1); // consume the code
    await c.env.DB.prepare('UPDATE user_mfa_secrets SET backupCodes = ? WHERE id = ?')
      .bind(JSON.stringify(backupCodes), row.id).run().catch(() => {});
    verified = true;
  } else {
    verified = await TOTPService.verify(row.secret, code);
  }

  if (!verified) throw new HTTPException(401, { message: 'Invalid MFA code' });

  // Mark the secret as verified (first-time setup confirmation)
  await c.env.DB.prepare(
    'UPDATE user_mfa_secrets SET verifiedAt = COALESCE(verifiedAt, ?) WHERE id = ?'
  ).bind(Date.now(), row.id).run().catch(() => {});

  // Issue new JWT with mfaVerified: true
  const service = new AuthService(c.env, c.executionCtx);
  const dbUser = await c.env.DB.prepare('SELECT id, email, name, avatarUrl FROM users WHERE id = ?')
    .bind(user.id).first<any>().catch(() => null);
  if (!dbUser) throw new HTTPException(404, { message: 'User not found' });

  const token = await service.signToken(
    { ...dbUser, workspaceId, workspaceRole: (user as any).role },
    { mfaVerified: true }
  );
  return c.json({ token });
});

// 5. MFA Status — check if the user has MFA set up for the workspace
auth.get('/mfa/status', authMiddleware(), async (c) => {
  const user = c.get('user');
  const workspaceId = c.req.header('x-workspace-id') || (user as any).workspaceId;
  if (!workspaceId) return c.json({ enabled: false });

  const row = await c.env.DB.prepare(
    'SELECT verifiedAt FROM user_mfa_secrets WHERE userId = ? AND workspaceId = ?'
  ).bind(user.id, workspaceId).first<{ verifiedAt: number | null }>().catch(() => null);

  return c.json({ enabled: !!row?.verifiedAt });
});

// 6. MFA Remove — let the user disable their MFA (or admin can target userId)
auth.delete('/mfa', authMiddleware(), async (c) => {
  const user = c.get('user');
  const workspaceId = c.req.header('x-workspace-id') || (user as any).workspaceId;
  if (!workspaceId) throw new HTTPException(400, { message: 'x-workspace-id header required' });

  await c.env.DB.prepare(
    'DELETE FROM user_mfa_secrets WHERE userId = ? AND workspaceId = ?'
  ).bind(user.id, workspaceId).run().catch(() => {});

  return c.json({ ok: true });
});

export default auth;
