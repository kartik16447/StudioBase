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

    // Stub IdP redirect
    const redirectUrl = `https://mock-idp.com/auth?domain=${searchDomain}&provider=${wsSetting.ssoProvider}`;
    return c.json({ redirectUrl });
  }

  static async callback(c: AppContext) {
    const { token, code } = await c.req.json();
    
    // Stub token exchange
    if (!token && !code) {
      return c.json({ error: 'Token or code missing' }, 400);
    }

    const mockJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzb21ldXNlciIsImRvbWFpbiI6Im1vY2tkb21haW4uY29tIn0.mocksignature';

    return c.json({ token: mockJwt, message: 'SSO token exchange successful' });
  }
}
