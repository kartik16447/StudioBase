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
    if (path.startsWith('http')) return path;
    return `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
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

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    this.logLegacyWarning(url);

    const res = await fetch(url, {
      ...options,
      headers: { ...this.getHeaders(), ...options.headers },
    });
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
}

export const apiClient = new ApiClient();
