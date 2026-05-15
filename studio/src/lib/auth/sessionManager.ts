import { apiClient } from '../apiClient';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

class SessionManager {
  private user: User | null = null;
  private workspaceId: string | null = null;

  constructor() {
    this.restoreSession();
  }

  private restoreSession() {
    const savedUser = localStorage.getItem('sb_user');
    const savedWorkspaceId = localStorage.getItem('sb_active_workspace') || localStorage.getItem('sb_workspaceId');
    if (savedUser) {
      try {
        this.user = JSON.parse(savedUser);
        this.workspaceId = savedWorkspaceId;
      } catch {
        this.logout();
      }
    }
  }

  async loginWithGoogle(accessToken: string) {
    try {
      console.log('🔑 [Auth] Exchanging Google token for internal JWT...');
      const data = await apiClient.post<{ 
        token: string; 
        user: User; 
        workspaceId: string; 
        workspaceRole: string 
      }>('/auth/google', { accessToken });

      // Save everything
      localStorage.setItem('sb_token', data.token);
      localStorage.setItem('sb_user', JSON.stringify(data.user));
      localStorage.setItem('sb_workspaceId', data.workspaceId);
      
      this.user = data.user;
      this.workspaceId = data.workspaceId;

      console.log(`✅ [Auth] Logged in as ${data.user.email} (WS: ${data.workspaceId})`);
      return data;
    } catch (err) {
      console.error('❌ [Auth] Google login failed:', err);
      throw err;
    }
  }

  logout() {
    localStorage.removeItem('sb_token');
    localStorage.removeItem('sb_user');
    localStorage.removeItem('sb_workspaceId');
    sessionStorage.removeItem('sb_token');
    this.user = null;
    this.workspaceId = null;
    window.location.href = '/';
  }

  isAuthenticated(): boolean {
    return !!localStorage.getItem('sb_token');
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
      console.log('🔄 [Auth] Syncing workspace context from backend...');
      const { workspaces } = await apiClient.get<{ workspaces: any[] }>('/workspaces');
      
      if (workspaces.length === 0) {
        console.warn('⚠️ [Auth] User has no workspaces!');
        return;
      }

      // If current workspaceId is stale/invalid, reset to first available
      const isValid = this.workspaceId && workspaces.some(w => w.id === this.workspaceId);
      if (!isValid) {
        console.log(`[Auth] Stale workspaceId (${this.workspaceId}) corrected to ${workspaces[0].id}`);
        this.setWorkspaceId(workspaces[0].id);
      }
      
      return workspaces;
    } catch (err) {
      console.error('❌ [Auth] Workspace sync failed:', err);
    }
  }
}

export const sessionManager = new SessionManager();
