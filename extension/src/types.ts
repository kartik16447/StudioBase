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

export interface RawStepPayload {
  action: 'click' | 'input' | 'scroll' | 'navigate';
  timestamp: number;
  url: string;
  pageTitle: string;
  selector: string | null;
  selectorConfidence: 'high' | 'medium' | 'low' | null;
  elementText: string | null;
  elementRole: string | null;
  elementType: string | null;
  inputValue: string | null;
  coordinates: {
    x: number;
    y: number;
    viewportWidth: number;
    viewportHeight: number;
    scrollX: number;
    scrollY: number;
    elementRect: { top: number; left: number; width: number; height: number } | null;
  };
  isIframeBlocked: boolean;
  frameUrl: string;
}

export interface CaptureTarget {
  includeMic?: boolean;
  streamId?: string;
  tabTitle?: string;
  userTitle?: string;
}

export interface AppState {
  status: AppStatus;
  sessionId?: string | null;
  startedAt?: number | null;
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
  sv_user?: BackendUser;
  sv_accounts?: StorageAccount[];
  sv_sessions?: Record<string, SessionMetadata>;
  sv_state?: AppState;
}

export type WorkerMessage =
  | { type: 'GET_STATE' }
  | { type: 'SET_STATUS'; status: AppStatus }
  | { type: 'START_RECORDING'; target: CaptureTarget }
  | { type: 'STOP_RECORDING' }
  | { type: 'STATE_UPDATE'; state: AppState }
  | { type: 'CAPTURE_STEP'; payload: RawStepPayload }
  | { type: 'LOG'; logMessage: { tag: string; data: any } };
