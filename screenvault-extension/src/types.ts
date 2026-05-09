// Every type the system uses. No imports needed.

export type AppStatus =
  | 'idle'
  | 'recording'
  | 'uploading'
  | 'finalizing'
  | 'ready'
  | 'enriching'
  | 'failed_enrichment'
  | 'failed'
  | 'error';
  
export interface PreAllocationResult {
  id: string;
  url: string;
  fileName: string;
  account: StorageAccount;
  folderId?: string;
}

export interface SessionMetadata {
  sessionId: string;
  fileId: string;
  title?: string;
  accountId: string;
  
  // Telemetry
  startedAt: number;
  stoppedAt?: number;
  uploadStartedAt?: number;
  uploadCompleteAt?: number;
  backendFinalizedAt?: number;
  linkReadyAt?: number;
  enrichmentFinishedAt?: number;

  status: 'recording' | 'uploading' | 'finalizing' | 'ready' | 'enriching' | 'failed_enrichment' | 'error';
  
  processingStartedAt?: number;
  duration?: number;
  actualDurationMs?: number;
  backendVideoId?: string;
  previewUrl?: string;
  playerUrl?: string;
  encryptedFileId?: string;
  accountEmail?: string;
  thumbnailUrl?: string;
  backendSynced?: boolean;
  usageSynced?: boolean;
}

export interface RecordingTarget {
  includeMic?: boolean;
  tabId?: number;
  tabTitle?: string;
}

export interface AppState {
  status: AppStatus;
  sessionId: string | null;
  startedAt: number | null;
  target: RecordingTarget | null;
  uploadProgress: number;        // 0–100
  uploadUrl: string | null;
  preAllocatedFileId: string | null;
  uploadAccount: string | null;  // email
  errorMessage: string | null;
  backendVideoId: string | null;
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
  workspaceSlug: string;
  workspaceRole: string;
}

export interface BackendVideo {
  id: string;
  fileId: string;
  sessionId?: string;
  workspaceId: string;
  title: string;
  playerUrl?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  webViewLink?: string;
  accountEmail?: string;
  account_email?: string; // Legacy snake_case from worker
  status: 'uploading' | 'finalizing' | 'ready' | 'enriching' | 'failed' | 'deleted';
  actualDurationMs?: number;
  ownerId: string;
  createdAt: number;
}

export interface StorageSchema {
  sv_user?: BackendUser;
  sv_accounts?: StorageAccount[];
  sv_sessions?: Record<string, SessionMetadata>;
  sv_state?: AppState;
}

// Messages from popup → service worker
export type PopupMessage =
  | { type: 'GET_STATE' }
  | { type: 'GET_ACCOUNTS' }
  | { type: 'START_RECORDING'; target: RecordingTarget }
  | { type: 'STOP_RECORDING' }
  | { type: 'CONNECT_ACCOUNT' }
  | { type: 'SAVE_TO_DISK' }
  | { type: 'SET_STATUS'; status: AppStatus }
  | { type: 'PRE_ALLOCATE_AND_COPY' }
  | { type: 'GET_PENDING_SESSIONS' }
  | { type: 'RECOVER_SESSION'; sessionId: string }
  | { type: 'DELETE_SESSION'; sessionId: string };

// Messages from service worker → popup
export type WorkerMessage =
  | { type: 'STATE_UPDATE'; state: AppState }
  | { type: 'ACCOUNTS_UPDATE'; accounts: StorageAccount[] }
  | { type: 'INSTANT_LINK'; url: string; fileId: string };

// Messages between service worker ↔ offscreen
export type OffscreenMessage =
  | {
      type: 'START_SCREEN';
      fileId: string;
      sessionId: string;
      includeMic?: boolean;
      account: StorageAccount;
      sv_user?: BackendUser;
      sv_accounts?: StorageAccount[];
      title?: string;
      folderId?: string;
    }
  | { type: 'STOP'; account: StorageAccount | null }
  | { type: 'CAPTURE_STARTED' }
  | { type: 'RECORDING_ERROR'; message: string }
  | { type: 'UPLOAD_PROGRESS'; progress: number }
  | { type: 'UPLOAD_COMPLETE'; url: string; account: string }
  | { type: 'RECORDING_FINISHED'; blobUrl: string }
  | { type: 'MIC_PERMISSION_REQUIRED' }
  | { 
      type: 'RECOVER_AND_UPLOAD'; 
      sessionId: string; 
      fileId: string; 
      account: StorageAccount;
      sv_user?: BackendUser;
      sv_accounts?: StorageAccount[];
    }
  | { type: 'SET_SESSION_STATUS'; sessionId: string; status: SessionMetadata['status'] }
  | { type: 'SAVE_SESSION_METADATA'; sessionId: string; metadata: Partial<SessionMetadata> }
  | { type: 'REMOVE_SESSION_METADATA'; sessionId: string }
  | { type: 'GET_SESSION_METADATA'; sessionId: string }
  | { type: 'GET_ACCOUNTS' }
  | { type: 'GET_TOKEN'; interactive?: boolean; accountId?: string }
  | { type: 'GET_USER' }
  | { type: 'OFFSCREEN_READY' };
