import { V1_API_URL } from '../../../shared/constants';

class ApiClient {
  private baseUrl: string = V1_API_URL;

  private getHeaders(): HeadersInit {
    const token = localStorage.getItem('sb_token') || sessionStorage.getItem('sb_token');
    const workspaceId = localStorage.getItem('sb_active_workspace') || localStorage.getItem('sb_workspaceId');
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(workspaceId ? { 'x-workspace-id': workspaceId } : {}),
    };
  }

  getUrl(path: string): string {
    const token = localStorage.getItem('sb_token') || sessionStorage.getItem('sb_token');
    const separator = path.includes('?') ? '&' : '?';
    const authQuery = token ? `${separator}token=${token}` : '';
    
    if (path.startsWith('http')) return `${path}${authQuery}`;
    return `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}${authQuery}`;
  }

  private async handleResponse<T>(res: Response, requestPath?: string): Promise<T> {
    if (!res.ok) {
      let errorData: any;
      try {
        const clonedRes = res.clone();
        try {
          errorData = await res.json();
        } catch {
          errorData = { message: await clonedRes.text() };
        }
      } catch (err) {
        errorData = { message: `Request failed with status ${res.status}` };
      }

      // Global Error Interceptor
      if (res.status === 401) {
        console.warn('🔑 [API] 401 Unauthorized - Redirecting to login');
        window.dispatchEvent(new CustomEvent('SB_AUTH_EXPIRED'));
      } else if (res.status === 403) {
        console.warn('🚫 [API] 403 Forbidden:', requestPath);
        window.dispatchEvent(new CustomEvent('SB_PERMISSION_DENIED', { 
          detail: { path: requestPath } 
        }));
      } else if (res.status >= 500) {
        console.error('💥 [API] Server error:', requestPath, errorData);
        window.dispatchEvent(new CustomEvent('SB_SERVER_ERROR', { 
          detail: { path: requestPath, message: errorData?.message } 
        }));
      }

      const error = new Error(errorData.message || errorData.error || `Request failed with status ${res.status}`);
      (error as any).status = res.status;
      (error as any).data = errorData;
      throw error;
    }

    return res.json();
  }

  private logLegacyWarning(url: string) {
    if (!url.includes('/v1/')) {
      console.warn(`⚠️ [LEGACY API CALL DETECTED]: ${url}. Please migrate to /v1/ routes.`);
    }
  }

  async get<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    this.logLegacyWarning(url);
    
    const res = await fetch(url, {
      ...options,
      method: 'GET',
      headers: { ...this.getHeaders(), ...options.headers },
    });
    return this.handleResponse<T>(res, path);
  }

  async post<T>(path: string, body?: any, options: RequestInit = {}): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    this.logLegacyWarning(url);

    const res = await fetch(url, {
      ...options,
      method: 'POST',
      headers: { ...this.getHeaders(), ...options.headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return this.handleResponse<T>(res, path);
  }

  async patch<T>(path: string, body?: any, options: RequestInit = {}): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    this.logLegacyWarning(url);

    const res = await fetch(url, {
      ...options,
      method: 'PATCH',
      headers: { ...this.getHeaders(), ...options.headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return this.handleResponse<T>(res, path);
  }

  async delete<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    this.logLegacyWarning(url);

    const res = await fetch(url, {
      ...options,
      method: 'DELETE',
      headers: { ...this.getHeaders(), ...options.headers },
    });
    return this.handleResponse<T>(res, path);
  }

  async getBlob(path: string): Promise<Blob> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let msg = 'Export failed';
      try { msg = JSON.parse(text)?.error || msg; } catch {}
      throw new Error(msg);
    }
    return res.blob();
  }

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    this.logLegacyWarning(url);

    const res = await fetch(url, {
      ...options,
      headers: { ...this.getHeaders(), ...options.headers },
    });
    return this.handleResponse<T>(res, path);
  }

  async postForm<T>(path: string, body: FormData, options: RequestInit = {}): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    const headers = { ...this.getHeaders() } as Record<string, string>;
    delete headers['Content-Type']; // let browser set multipart boundary
    const res = await fetch(url, { ...options, method: 'POST', headers: { ...headers, ...options.headers as any }, body });
    return this.handleResponse<T>(res, path);
  }

  // Helper for R2 uploads (bypass JSON and versioning if needed)
  async upload(url: string, body: ArrayBuffer | Blob, contentType: string) {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res;
  }

  // ── Comments ────────────────────────────────────────────────────────────────
  comments = {
    list: (sopId: string) =>
      this.get<{ comments: CommentItem[] }>(`/comments?sopId=${sopId}`),

    create: (sopId: string, body: string, stepId?: string | null) =>
      this.post<CommentItem>('/comments', { sopId, stepId: stepId ?? null, body }),

    resolve: (commentId: string) =>
      this.patch<CommentItem>(`/comments/${commentId}/resolve`),

    remove: (commentId: string) =>
      this.delete<{ ok: boolean }>(`/comments/${commentId}`),
  };

  // ── Notifications ────────────────────────────────────────────────────────────
  notifications = {
    list: () =>
      this.get<{ notifications: NotificationItem[]; unreadCount: number }>('/notifications'),

    markRead: (notifId: string) =>
      this.post<{ ok: boolean }>(`/notifications/${notifId}/read`),

    markAllRead: () =>
      this.post<{ ok: boolean }>('/notifications/read-all'),
  };

  // ── Sharing ──────────────────────────────────────────────────────────────────
  sessions = {
    setShare: (sessionId: string, isPublic: boolean) =>
      this.patch<{ isPublic: boolean; shareToken: string | null; shareUrl: string | null }>(
        `/sessions/${sessionId}/share`,
        { isPublic },
      ),
  };

  // ── Workspace Invites ────────────────────────────────────────────────────────
  invites = {
    list: () =>
      this.get<{ invites: PendingInvite[] }>('/workspaces/invites'),

    create: (role: string) =>
      this.post<{ invite: PendingInvite }>('/workspaces/invites', { role }),

    revoke: (inviteId: string) =>
      this.post<{ ok: boolean }>(`/workspaces/invites/${inviteId}/revoke`),
  };

  // ── Workspace Members ────────────────────────────────────────────────────────
  workspaces = {
    removeMember: (workspaceId: string, userId: string) =>
      this.delete<{ ok: boolean }>(`/workspaces/${workspaceId}/members/${userId}`),
  };
}

// ── Shared types (consumed by store + components) ─────────────────────────────

export interface CommentItem {
  id: string;
  sopId: string;
  stepId: string | null;
  authorId: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
  body: string;
  resolvedAt: number | null;
  resolvedBy: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface NotificationItem {
  id: string;
  type: string;
  actorId: string | null;
  actorName: string | null;
  targetId: string | null;
  metadata: string | null;  // JSON string
  readAt: number | null;
  createdAt: number;
}

export interface PendingInvite {
  id: string;
  token: string;
  role: string;
  createdAt: number;
  expiresAt: number | null;
}

export const apiClient = new ApiClient();
