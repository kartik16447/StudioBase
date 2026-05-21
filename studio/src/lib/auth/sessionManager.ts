import { apiClient } from '../apiClient';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

const GOOGLE_CLIENT_ID = '813435932187-oktc8br8kq98luccqgmsdnhju3h80lht.apps.googleusercontent.com';
// Refresh if JWT has less than 1 day left
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;

class SessionManager {
  private user: User | null = null;
  private workspaceId: string | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.restoreSession();
    this.scheduleRefreshIfNeeded();
  }

  private restoreSession() {
    const savedUser = localStorage.getItem('sb_user');
    const savedWorkspaceId = localStorage.getItem('sb_active_workspace') || localStorage.getItem('sb_workspaceId');
    if (savedUser) {
      try {
        this.user = JSON.parse(savedUser);
        this.workspaceId = savedWorkspaceId;
      } catch {
        // Corrupted user JSON — remove it but keep the token so isAuthenticated() still works
        localStorage.removeItem('sb_user');
      }
    }
  }

  // Decode JWT expiry without a library
  private getTokenExpiry(token: string): number | null {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp ? payload.exp * 1000 : null;
    } catch {
      return null;
    }
  }

  private scheduleRefreshIfNeeded() {
    const token = localStorage.getItem('sb_token');
    if (!token || token.startsWith('ya29.')) return; // not an internal JWT

    const expiry = this.getTokenExpiry(token);
    if (!expiry) return;

    const msUntilRefresh = expiry - Date.now() - REFRESH_THRESHOLD_MS;
    if (msUntilRefresh <= 0) {
      // Already near/past expiry — trigger silent refresh now
      this.silentRefresh();
      return;
    }

    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.silentRefresh(), msUntilRefresh);
  }

  private async silentRefresh() {
    const google = (window as any).google;
    if (!google?.accounts?.oauth2) return;

    return new Promise<void>((resolve) => {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'email profile openid',
        prompt: '', // silent — no popup
        callback: async (resp: { access_token?: string; error?: string }) => {
          if (resp.error || !resp.access_token) {
            console.warn('[Auth] Silent refresh failed:', resp.error);
            resolve();
            return;
          }
          try {
            await this.loginWithGoogle(resp.access_token);
            console.log('[Auth] Token silently refreshed.');
          } catch {
            console.warn('[Auth] Silent refresh exchange failed.');
          }
          resolve();
        },
      });
      tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  async loginWithGoogleCode(code: string, codeVerifier: string, redirectUri: string) {
    const data = await apiClient.post<{
      token: string; user: User; workspaceId: string; workspaceRole: string;
    }>('/auth/google', { code, codeVerifier, redirectUri });

    if (data.token) localStorage.setItem('sb_token', data.token);
    if (data.user)  localStorage.setItem('sb_user', JSON.stringify(data.user));
    if (data.workspaceId) {
      localStorage.setItem('sb_workspaceId', data.workspaceId);
      if (!localStorage.getItem('sb_active_workspace')) {
        localStorage.setItem('sb_active_workspace', data.workspaceId);
      }
    }
    this.user = data.user;
    this.workspaceId = data.workspaceId;
    this.scheduleRefreshIfNeeded();
    console.log(`✅ [Auth] Logged in as ${data.user.email}`);
    return data;
  }

  async loginWithGoogle(tokenOrCredential: string) {
    try {
      console.log('🔑 [Auth] Exchanging Google token for internal JWT...');
      const data = await apiClient.post<{
        token: string;
        user: User;
        workspaceId: string;
        workspaceRole: string;
      }>('/auth/google', { accessToken: tokenOrCredential });

      if (data.token) localStorage.setItem('sb_token', data.token);
      if (data.user)  localStorage.setItem('sb_user', JSON.stringify(data.user));
      if (data.workspaceId) {
        localStorage.setItem('sb_workspaceId', data.workspaceId);
        if (!localStorage.getItem('sb_active_workspace')) {
          localStorage.setItem('sb_active_workspace', data.workspaceId);
        }
      }

      this.user = data.user;
      this.workspaceId = data.workspaceId;

      // Schedule next refresh based on the new JWT
      this.scheduleRefreshIfNeeded();

      console.log(`✅ [Auth] Logged in as ${data.user.email}`);
      return data;
    } catch (err) {
      console.error('❌ [Auth] Google login failed:', err);
      throw err;
    }
  }

  logout() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    localStorage.removeItem('sb_token');
    localStorage.removeItem('sb_auth_token');
    localStorage.removeItem('sb_user');
    localStorage.removeItem('sb_workspaceId');
    localStorage.removeItem('sb_active_workspace');
    localStorage.removeItem('sb_last_route');
    localStorage.removeItem('sb_ext_token');
    sessionStorage.removeItem('sb_token');
    this.user = null;
    this.workspaceId = null;
    window.location.href = '/';
  }

  isAuthenticated(): boolean {
    const token = localStorage.getItem('sb_token');
    if (!token) return false;
    // Reject raw Google tokens (ya29.) — they expire in 1h and we can't use them as session tokens
    if (token.startsWith('ya29.')) return false;
    return true;
  }

  getUser(): User | null {
    return this.user;
  }

  getWorkspaceId(): string | null {
    return this.workspaceId;
  }

  setWorkspaceId(id: string) {
    this.workspaceId = id;
    localStorage.setItem('sb_active_workspace', id);
    localStorage.setItem('sb_workspaceId', id);
  }

  async syncWorkspaces() {
    if (!this.isAuthenticated()) return;
    try {
      const { workspaces } = await apiClient.get<{ workspaces: any[] }>('/workspaces');
      if (workspaces.length === 0) return;
      const isValid = this.workspaceId && workspaces.some(w => w.id === this.workspaceId);
      if (!isValid) this.setWorkspaceId(workspaces[0].id);

      // Persist the plan for the active workspace so usePlan() can read it
      // synchronously anywhere in the app without an extra API call.
      const activeId = this.workspaceId ?? workspaces[0]?.id;
      const activeWs = workspaces.find(w => w.id === activeId) ?? workspaces[0];
      if (activeWs?.plan) {
        try { localStorage.setItem('sb_workspace_plan', activeWs.plan); } catch {}
      }

      return workspaces;
    } catch (err) {
      console.error('❌ [Auth] Workspace sync failed:', err);
    }
  }
}

export const sessionManager = new SessionManager();
