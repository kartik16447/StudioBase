// Every type the system uses.
export type AppStatus =
  | 'idle'
  | 'recording'
  | 'uploading'
  | 'finalizing'
  | 'ready'
  | 'enriching'
  | 'failed_enrichment'
  | 'error';

export interface CaptureTarget {
  includeMic?: boolean;
  includeVideo?: boolean;
  streamId?: string | null;
  tabId?: number;
  tabUrl?: string;
  tabTitle?: string;
  userTitle?: string;
}

export interface AppState {
  status: AppStatus;
  sessionId?: string | null;
  localSessionId?: string | null;
  startedAt?: number | null;
  includeMic?: boolean;
  includeVideo?: boolean;
  target?: CaptureTarget | null;
  uploadProgress?: number;
  uploadUrl?: string | null;
  errorMessage?: string | null;
}

export interface StorageAccount {
  id: string;
  email: string;
  displayName: string;
  accessToken: string;
  expiresAt: number;
  quotaTotal: number;
  quotaUsed: number;
  lastQuotaUpdate?: number;
  uploadSuccessCount?: number;
  uploadFailureCount?: number;
  invalid?: boolean;
  invalidReason?: string;
  isPrimary: boolean;
  isActive: boolean;
  driveRootFolderId?: string;
  workspaceMappings?: Record<string, string>; // workspaceId -> folderId
}

export interface BackendUser {
  accessToken: string;
  userId: string;
  email: string;
  workspaceId: string;
  workspaceSlug?: string;
  workspaceRole?: string;
  picture?: string;
}

export interface BackendVideo {
  id: string;
  fileId: string;
  sessionId: string;
  workspaceId: string;
  ownerId: string;
  playerUrl: string;
  title: string;
  status: string;
  createdAt: number;
  accountEmail?: string;
  account_email?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  webViewLink?: string;
}

export interface SessionMetadata {
  sessionId: string;
  fileId: string;
  status: 'ready' | 'uploading' | 'failed';
  startedAt: number;
  title: string;
  accountEmail: string;
  thumbnailUrl?: string;
  playerUrl?: string;
  backendVideoId?: string;
}

export interface StorageSchema {
  sb_user?: BackendUser;
  sv_accounts?: StorageAccount[]; // kept: still read in dashboard/index.tsx
  sb_sessions?: Record<string, SessionMetadata>;
  sb_state?: AppState;
}

export type WorkerMessage =
  | { type: 'GET_STATE' }
  | { type: 'SET_STATUS'; status: AppStatus }
  | { type: 'START_RECORDING'; target: CaptureTarget }
  | { type: 'STOP_RECORDING' }
  | { type: 'ABORT_RECORDING' }
  | { type: 'RETRY_UPLOAD' }
  | { type: 'SIGN_IN' }
  | { type: 'SHOW_POPUP'; state: AppState }
  | { type: 'STATE_UPDATE'; state: AppState }
  | { type: 'LOG'; logMessage: { tag: string; data: any } }
  | { type: 'CAPTURE_STEP'; payload: any };

