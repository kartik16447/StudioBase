import { apiClient } from '../../../lib/apiClient';
import { sessionManager } from '../../../lib/auth/sessionManager';

// Summary returned by list endpoint (no blocks)
export interface ApiDocSummary {
  id: string;
  parentId: string | null;
  title: string;
  emoji: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

// Full doc returned by get/create/update (blocks included)
export interface ApiDoc extends ApiDocSummary {
  blocks: any[];
}

export interface ApiSearchHit {
  id: string;
  title: string;
  emoji: string | null;
  snippet: string;
}

function base() {
  const wsId = sessionManager.getWorkspaceId();
  return `/workspaces/${wsId}/docs`;
}

export const docsApi = {
  list: (): Promise<ApiDocSummary[]> =>
    apiClient.get<ApiDocSummary[]>(base()),

  get: (id: string): Promise<ApiDoc> =>
    apiClient.get<ApiDoc>(`${base()}/${id}`),

  create: (p: {
    title: string;
    emoji?: string | null;
    parentId?: string | null;
    blocks?: any[];
  }): Promise<ApiDoc> =>
    apiClient.post<ApiDoc>(base(), p),

  update: (id: string, p: {
    title?: string;
    emoji?: string | null;
    blocks?: any[];
    parentId?: string | null;
    sortOrder?: number;
  }): Promise<ApiDoc> =>
    apiClient.patch<ApiDoc>(`${base()}/${id}`, p),

  delete: (id: string): Promise<{ ok: boolean }> =>
    apiClient.delete<{ ok: boolean }>(`${base()}/${id}`),

  search: (q: string): Promise<ApiSearchHit[]> =>
    apiClient.get<ApiSearchHit[]>(`${base()}/search?q=${encodeURIComponent(q)}`),
};
