import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../../middlewares/auth';
import { workspaceMiddleware, requirePermission } from '../../middlewares/workspace';
import {
  UpdateWorkspaceSchema,
  CreateInviteSchema,
  JoinWorkspaceSchema
} from '../../schemas/workspaces';
import { WorkspaceController } from '../../controllers/WorkspaceController';
import { planGate } from '../../middlewares/plan';
import { FeatureGateService } from '../../services/FeatureGateService';
import { EmailService } from '../../services/EmailService';
import { AuditService } from '../../services/AuditService';
import { HTTPException } from 'hono/http-exception';

const UpdateMemberRoleSchema = z.object({
  role: z.enum(['Viewer', 'Member', 'Admin']),
});

const workspaces = new Hono<{ Bindings: Env; Variables: Variables }>();

// 1. List Workspaces (Global context)
workspaces.get('/', authMiddleware(), WorkspaceController.list);

// 2. Join Workspace (Global context - uses token)
workspaces.post('/join', authMiddleware(), zValidator('json', JoinWorkspaceSchema), WorkspaceController.join);

// --- WORKSPACE CONTEXT ROUTES ---
const wsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
wsRoutes.use('*', authMiddleware(), workspaceMiddleware());

// 3. Update Workspace
wsRoutes.patch('/', requirePermission('workspace:admin'), zValidator('json', UpdateWorkspaceSchema), WorkspaceController.update);

// 3b. Get Brand Config (read-only)
wsRoutes.get('/brand', async (c) => {
  const ws = c.get('workspace');
  const row = await c.env.DB.prepare(
    'SELECT brandConfig FROM workspaces WHERE id = ?'
  ).bind(ws.id).first<{ brandConfig: string | null }>();
  let brandConfig: Record<string, any> = {};
  if (row?.brandConfig) {
    try { brandConfig = JSON.parse(row.brandConfig); } catch {}
  }
  return c.json({ brandConfig });
});

// 3c. Get Workspace Settings (read-only)
wsRoutes.get('/settings', async (c) => {
  const ws = c.get('workspace');
  const row = await c.env.DB.prepare(
    'SELECT * FROM workspace_settings WHERE workspaceId = ?'
  ).bind(ws.id).first();
  return c.json({ settings: row || { workspaceId: ws.id, ssoEnabled: 0, dataRegion: 'global', retentionDays: 90 } });
});

// 4. List Pending Invites
wsRoutes.get('/invites', requirePermission('member:invite'), async (c) => {
  const ws = c.get('workspace');
  const now = Date.now();
  const rows = await c.env.DB
    .prepare(`
      SELECT i.id, i.token, i.role, i.createdAt, i.expiresAt
      FROM invites i
      WHERE i.workspaceId = ?
        AND i.revokedAt IS NULL
        AND (i.expiresAt IS NULL OR i.expiresAt > ?)
      ORDER BY i.createdAt DESC
      LIMIT 50
    `)
    .bind(ws.id, now)
    .all<{ id: string; token: string; role: string; createdAt: number; expiresAt: number | null }>();
  return c.json({ invites: rows.results });
});

// 4b. Create Invite
wsRoutes.post('/invites', requirePermission('member:invite'), planGate('seat'), zValidator('json', CreateInviteSchema), WorkspaceController.createInvite);

// 5. Revoke Invite
wsRoutes.post('/invites/:inviteId/revoke', requirePermission('workspace:admin'), WorkspaceController.revokeInvite);

// 6. List Members
wsRoutes.get('/members', WorkspaceController.listMembers);

// 7. Remove Member
wsRoutes.delete('/members/:userId', requirePermission('workspace:admin'), WorkspaceController.removeMember);

// 8. Update Member Role
wsRoutes.patch('/members/:userId', requirePermission('workspace:admin'), zValidator('json', UpdateMemberRoleSchema), async (c) => {
  const ws = c.get('workspace');
  const actor = c.get('user');
  const targetUserId = c.req.param('userId');
  const { role } = c.req.valid('json');

  if (!targetUserId) throw new HTTPException(400, { message: 'Missing userId' });

  const target = await c.env.DB.prepare(
    'SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?'
  ).bind(ws.id, targetUserId).first<{ role: string }>();

  if (!target) throw new HTTPException(404, { message: 'Member not found' });
  if (target.role === 'Owner') throw new HTTPException(403, { message: 'Cannot change Owner role' });
  if (actor.id === targetUserId) throw new HTTPException(400, { message: 'Cannot change your own role' });

  await c.env.DB.prepare(
    'UPDATE workspace_members SET role = ? WHERE workspaceId = ? AND userId = ?'
  ).bind(role, ws.id, targetUserId).run();

  return c.json({ success: true, userId: targetUserId, role });
});

// 9. Revoke all active sessions (owner/admin) — sets revokedBefore timestamp
wsRoutes.post('/sessions/revoke-all', requirePermission('workspace:admin'), async (c) => {
  const ws = c.get('workspace');
  const actor = c.get('user');
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO workspace_settings (workspaceId, revokedBefore, dataRegion, retentionDays)
     VALUES (?, ?, 'global', 90)
     ON CONFLICT(workspaceId) DO UPDATE SET revokedBefore = excluded.revokedBefore`
  ).bind(ws.id, now).run();

  const audit = new AuditService(c.env, c.executionCtx);
  await audit.record({ eventName: 'workspace.sessions_revoked', workspaceId: ws.id, userId: actor.id, properties: { revokedBefore: now } });

  return c.json({ ok: true, revokedBefore: now });
});

// 10. Update workspace settings (allowedDomains, dataRegion, sessionTtlHours, mfaRequired)
wsRoutes.patch('/settings', requirePermission('workspace:admin'), async (c) => {
  const ws = c.get('workspace');
  const body = await c.req.json<{
    allowedDomains?: string;
    dataRegion?: string;
    retentionDays?: number;
    sessionTtlHours?: number | null;
    mfaRequired?: boolean;
  }>();

  // Validate enterprise-gated fields
  if ('sessionTtlHours' in body || 'mfaRequired' in body) {
    const gates = new FeatureGateService(c.env);
    const [sessionFlag, mfaFlag] = await Promise.all([
      gates.resolve(ws.id, 'workspace:session_policy'),
      gates.resolve(ws.id, 'workspace:mfa_enforce'),
    ]);
    if ('sessionTtlHours' in body && !sessionFlag.enabled) {
      return c.json({ error: 'workspace:session_policy requires an Enterprise plan' }, 403);
    }
    if ('mfaRequired' in body && !mfaFlag.enabled) {
      return c.json({ error: 'workspace:mfa_enforce requires an Enterprise plan' }, 403);
    }
  }

  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO workspace_settings (workspaceId, allowedDomains, dataRegion, retentionDays, sessionTtlHours, mfaRequired, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspaceId) DO UPDATE SET
       allowedDomains   = COALESCE(excluded.allowedDomains, allowedDomains),
       dataRegion       = COALESCE(excluded.dataRegion, dataRegion),
       retentionDays    = COALESCE(excluded.retentionDays, retentionDays),
       sessionTtlHours  = CASE WHEN ${body.sessionTtlHours === null ? '1' : '0'} THEN NULL ELSE COALESCE(excluded.sessionTtlHours, sessionTtlHours) END,
       mfaRequired      = COALESCE(excluded.mfaRequired, mfaRequired),
       updatedAt        = excluded.updatedAt`
  ).bind(
    ws.id,
    body.allowedDomains ?? null,
    body.dataRegion ?? 'global',
    body.retentionDays ?? 90,
    body.sessionTtlHours ?? null,
    body.mfaRequired !== undefined ? (body.mfaRequired ? 1 : 0) : null,
    now,
  ).run();

  return c.json({ ok: true });
});

// 11. Transfer ownership — owner-only, two-step confirmed on frontend
wsRoutes.post('/transfer-owner', async (c) => {
  const ws = c.get('workspace');
  const actor = c.get('user');

  if (ws.role !== 'Owner') throw new HTTPException(403, { message: 'Only the Owner can transfer ownership' });

  const { targetUserId } = await c.req.json<{ targetUserId: string }>();
  if (!targetUserId) throw new HTTPException(400, { message: 'targetUserId required' });
  if (targetUserId === actor.id) throw new HTTPException(400, { message: 'Cannot transfer to yourself' });

  const target = await c.env.DB.prepare(
    'SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?'
  ).bind(ws.id, targetUserId).first<{ role: string }>();

  if (!target) throw new HTTPException(404, { message: 'Target user is not a workspace member' });

  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE workspace_members SET role = ? WHERE workspaceId = ? AND userId = ?')
      .bind('Owner', ws.id, targetUserId),
    c.env.DB.prepare('UPDATE workspace_members SET role = ? WHERE workspaceId = ? AND userId = ?')
      .bind('Admin', ws.id, actor.id),
    c.env.DB.prepare('UPDATE workspaces SET ownerId = ? WHERE id = ?')
      .bind(targetUserId, ws.id),
  ]);

  const audit = new AuditService(c.env, c.executionCtx);
  await audit.record({ eventName: 'workspace.ownership_transferred', workspaceId: ws.id, userId: actor.id, properties: { toUserId: targetUserId } });

  return c.json({ ok: true, newOwnerId: targetUserId });
});

// 12. Bulk invite — team+ plan required, sends individual email per address
wsRoutes.post('/invites/bulk', requirePermission('member:invite'), async (c) => {
  const ws = c.get('workspace');
  const actor = c.get('user');

  // Feature gate check
  const gates = new FeatureGateService(c.env);
  const flag = await gates.resolve(ws.id, 'workspace:bulk_invite');
  if (!flag.enabled) throw new HTTPException(402, { message: 'PLAN_LIMIT: bulk_invite requires Team plan or above' });

  const { emails, role = 'Member' } = await c.req.json<{ emails: string[]; role?: string }>();
  if (!Array.isArray(emails) || emails.length === 0) throw new HTTPException(400, { message: 'emails array required' });
  if (emails.length > 50) throw new HTTPException(400, { message: 'Max 50 emails per bulk invite' });

  const now = Date.now();
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000;

  // Resolve workspace name + actor name for email
  const wsRow = await c.env.DB.prepare('SELECT name FROM workspaces WHERE id = ?').bind(ws.id).first<{ name: string }>();
  const actorRow = await c.env.DB.prepare('SELECT name, email FROM users WHERE id = ?').bind(actor.id).first<{ name: string; email: string }>();
  const workspaceName = wsRow?.name ?? 'StudioBase workspace';
  const inviterName = actorRow?.name || actorRow?.email || 'Someone';

  const results: { email: string; status: 'sent' | 'failed'; token?: string }[] = [];
  const appUrl = c.env.APP_URL ?? 'https://app.studiobase.so';

  for (const email of emails) {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes('@')) { results.push({ email: trimmed, status: 'failed' }); continue; }

    try {
      const id = crypto.randomUUID();
      const token = crypto.randomUUID();

      await c.env.DB.prepare(
        'INSERT INTO invites (id, workspaceId, token, role, email, createdAt, expiresAt, invitedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(id, ws.id, token, role, trimmed, now, expiresAt, actor.id).run();

      const inviteUrl = `${appUrl}?join=${token}`;

      if (c.env.RESEND_API_KEY) {
        const emailSvc = new EmailService(c.env.RESEND_API_KEY, appUrl);
        await emailSvc.sendInviteEmail({ toEmail: trimmed, inviterName, workspaceName, role, inviteUrl });
      }

      results.push({ email: trimmed, status: 'sent', token });
    } catch {
      results.push({ email: trimmed, status: 'failed' });
    }
  }

  return c.json({ ok: true, results });
});

// 13. Save/update SAML SSO configuration (enterprise: workspace:sso_saml)
wsRoutes.patch('/sso', requirePermission('workspace:admin'), async (c) => {
  const ws = c.get('workspace');
  const body = await c.req.json<{
    metadataXml?: string;          // paste IdP metadata XML
    entityId?: string;             // or enter manually
    ssoUrl?: string;
    certificate?: string;
    enabled?: boolean;
  }>();

  const gates = new FeatureGateService(c.env);
  const flag = await gates.resolve(ws.id, 'workspace:sso_saml');
  if (!flag.enabled) {
    return c.json({ error: 'workspace:sso_saml requires an Enterprise plan' }, 403);
  }

  let idpConfig: { entityId: string; ssoUrl: string; certificate: string } | null = null;

  if (body.metadataXml) {
    try {
      const { SAMLService } = await import('../../services/SAMLService');
      idpConfig = SAMLService.parseIdPMetadata(body.metadataXml);
    } catch (err: any) {
      return c.json({ error: `Invalid metadata XML: ${err.message}` }, 400);
    }
  } else if (body.entityId && body.ssoUrl && body.certificate) {
    const cert = body.certificate.trim();
    idpConfig = {
      entityId: body.entityId.trim(),
      ssoUrl: body.ssoUrl.trim(),
      certificate: cert.startsWith('-----') ? cert
        : `-----BEGIN CERTIFICATE-----\n${cert}\n-----END CERTIFICATE-----`,
    };
  } else if (body.enabled === false) {
    // Disable SSO without changing config
    await c.env.DB.prepare(
      `INSERT INTO workspace_settings (workspaceId, ssoEnabled, dataRegion, retentionDays)
       VALUES (?, 0, 'global', 90)
       ON CONFLICT(workspaceId) DO UPDATE SET ssoEnabled = 0`
    ).bind(ws.id).run();
    return c.json({ ok: true, ssoEnabled: false });
  } else {
    return c.json({ error: 'Provide metadataXml or entityId+ssoUrl+certificate' }, 400);
  }

  const enabled = body.enabled !== false;
  await c.env.DB.prepare(
    `INSERT INTO workspace_settings (workspaceId, ssoEnabled, samlConfig, dataRegion, retentionDays)
     VALUES (?, ?, ?, 'global', 90)
     ON CONFLICT(workspaceId) DO UPDATE SET
       ssoEnabled  = excluded.ssoEnabled,
       samlConfig  = excluded.samlConfig,
       updatedAt   = ${Date.now()}`
  ).bind(ws.id, enabled ? 1 : 0, JSON.stringify(idpConfig)).run();

  return c.json({ ok: true, ssoEnabled: enabled, entityId: idpConfig.entityId });
});

workspaces.route('/', wsRoutes);

export default workspaces;
