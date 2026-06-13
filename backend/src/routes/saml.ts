import { Hono } from 'hono';
import { Env, Variables } from '../types/hono';
import { SAMLService } from '../services/SAMLService';
import { AuthService } from '../services/AuthService';

export const samlRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

function backendUrl(c: { env: Env; req: { url: string } }): string {
  if (c.env.APP_URL) {
    // APP_URL is the frontend app; derive backend origin from request
    const u = new URL(c.req.url);
    return `${u.protocol}//${u.host}`;
  }
  const u = new URL(c.req.url);
  return `${u.protocol}//${u.host}`;
}

// GET /saml/:workspaceId/metadata  — SP metadata XML for registration with the IdP
samlRoutes.get('/:workspaceId/metadata', async (c) => {
  const { workspaceId } = c.req.param();
  const xml = SAMLService.buildSpMetadata(workspaceId, backendUrl(c));
  return new Response(xml, {
    headers: { 'Content-Type': 'application/samlmetadata+xml; charset=utf-8' },
  });
});

// GET /saml/:workspaceId/sso  — SP-initiated SSO (redirects to IdP)
samlRoutes.get('/:workspaceId/sso', async (c) => {
  const { workspaceId } = c.req.param();
  const settings = await c.env.DB.prepare(
    'SELECT samlConfig, ssoEnabled FROM workspace_settings WHERE workspaceId = ?'
  ).bind(workspaceId).first<{ samlConfig: string | null; ssoEnabled: number }>().catch(() => null);

  if (!settings?.ssoEnabled || !settings.samlConfig) {
    return c.json({ error: 'SSO not configured for this workspace' }, 404);
  }

  let idpConfig;
  try { idpConfig = JSON.parse(settings.samlConfig); } catch {
    return c.json({ error: 'Invalid SSO configuration' }, 500);
  }

  const redirectUrl = SAMLService.buildAuthnRequest(workspaceId, backendUrl(c), idpConfig);
  return c.redirect(redirectUrl, 302);
});

// POST /saml/:workspaceId/acs  — Assertion Consumer Service (IdP posts here after authentication)
samlRoutes.post('/:workspaceId/acs', async (c) => {
  const { workspaceId } = c.req.param();
  const appUrl = c.env.APP_URL || 'https://studiobase.app';
  const errorRedirect = (msg: string) =>
    c.redirect(`${appUrl}/login?error=${encodeURIComponent(msg)}`, 302);

  // Load workspace SSO config
  const settings = await c.env.DB.prepare(
    'SELECT samlConfig, ssoEnabled FROM workspace_settings WHERE workspaceId = ?'
  ).bind(workspaceId).first<{ samlConfig: string | null; ssoEnabled: number }>().catch(() => null);

  if (!settings?.ssoEnabled || !settings.samlConfig) {
    return errorRedirect('SSO not configured for this workspace');
  }

  let idpConfig;
  try { idpConfig = JSON.parse(settings.samlConfig); } catch {
    return errorRedirect('Invalid SSO configuration');
  }

  // Parse form body
  let samlResponse: string | null = null;
  try {
    const form = await c.req.formData();
    samlResponse = form.get('SAMLResponse') as string | null;
  } catch {
    return errorRedirect('Missing SAMLResponse');
  }
  if (!samlResponse) return errorRedirect('Missing SAMLResponse');

  // Validate SAML assertion
  const spEntityId = `${backendUrl(c)}/saml/${workspaceId}`;
  let samlUser;
  try {
    samlUser = await SAMLService.parseAndValidateResponse(samlResponse, idpConfig, spEntityId);
  } catch (err: any) {
    console.error('[SAML] Validation error:', err.message);
    return errorRedirect(`Authentication failed: ${err.message}`);
  }

  // Resolve or create the user
  const email = samlUser.email.toLowerCase();
  let user = await c.env.DB.prepare(
    'SELECT id, email, name, avatarUrl FROM users WHERE email = ?'
  ).bind(email).first<{ id: string; email: string; name: string | null; avatarUrl: string | null }>().catch(() => null);

  if (!user) {
    // Auto-provision: SSO users are trusted by the IdP
    const newId = crypto.randomUUID();
    const displayName = samlUser.attributes['displayName']
      || samlUser.attributes['http://schemas.microsoft.com/identity/claims/displayname']
      || samlUser.attributes['urn:oid:2.16.840.1.113730.3.1.241']
      || email.split('@')[0];
    const now = Date.now();
    await c.env.DB.prepare(
      'INSERT INTO users (id, email, name, avatarUrl, createdAt, updatedAt) VALUES (?, ?, ?, NULL, ?, ?)'
    ).bind(newId, email, displayName, now, now).run().catch(() => {});
    user = { id: newId, email, name: displayName, avatarUrl: null };
  }

  // Ensure workspace membership
  const membership = await c.env.DB.prepare(
    'SELECT role FROM workspace_members WHERE userId = ? AND workspaceId = ?'
  ).bind(user.id, workspaceId).first<{ role: string }>().catch(() => null);

  if (!membership) {
    const now = Date.now();
    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO workspace_members (userId, workspaceId, role, joinedAt) VALUES (?, ?, ?, ?)'
    ).bind(user.id, workspaceId, 'Member', now).run().catch(() => {});
  }

  // Issue JWT
  const authService = new AuthService(c.env, c.executionCtx);
  const token = await authService.signToken({
    id: user.id,
    email: user.email,
    name: user.name,
    workspaceId,
    workspaceRole: membership?.role || 'Member',
  });

  // Redirect to app with token in fragment (never in query string to avoid server logs)
  return c.redirect(`${appUrl}/sso/callback#token=${encodeURIComponent(token)}&workspaceId=${encodeURIComponent(workspaceId)}`, 302);
});
