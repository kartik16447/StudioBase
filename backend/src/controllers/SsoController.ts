import { AppContext } from '../types/hono';

export class SsoController {
  static async init(c: AppContext) {
    const email = c.req.query('email');
    const domain = c.req.query('domain');

    let searchDomain = domain;
    if (!searchDomain && email) {
      searchDomain = email.split('@')[1];
    }

    if (!searchDomain) {
      return c.json({ error: 'Email or domain required' }, 400);
    }

    const wsSetting = await c.env.DB.prepare(
      'SELECT workspaceId, ssoEnabled, ssoProvider FROM workspace_settings WHERE allowedDomains LIKE ?'
    ).bind(`%${searchDomain}%`).first();

    if (!wsSetting || wsSetting.ssoEnabled === 0) {
      return c.json({ error: 'SSO not configured for this domain' }, 403);
    }

    return c.json({ error: 'SSO configuration is not yet available.' }, 501);
  }

  static async callback(c: AppContext) {
    return c.json({ error: 'SSO configuration is not yet available.' }, 501);
  }
}
