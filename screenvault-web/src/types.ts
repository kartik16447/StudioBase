export interface BackendVideo {
  id: string;
  fileId: string;
  sessionId?: string;
  workspaceId: string;
  folderId?: string | null;
  mediaType?: 'video' | 'image' | 'audio';
  title: string;
  playerUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  webViewLink?: string;
  accountEmail?: string;
  account_email?: string;
  status: 'uploading' | 'finalizing' | 'ready' | 'enriching' | 'failed' | 'deleted';
  actualDurationMs?: number;
  ownerId: string;
  createdAt: number;
}

export interface Folder {
  id: string;
  workspaceId: string;
  name: string;
}

export interface WorkspaceMember {
  userId: string;
  email: string;
  role: 'owner' | 'member';
}

export interface WorkspaceVideo {
  id: string;
  backendId: string;
  fileId: string;
  title: string;
  name: string;
  createdTime: string;
  createdAt?: number;
  thumbnailLink: string | null;
  previewUrl?: string;
  playerUrl?: string;
  accountEmail: string;
  status: string;
  ownerId?: string;
  workspaceId?: string;
  folderId?: string | null;
  mediaType?: 'video' | 'image' | 'audio';
}
