import { WorkspaceContext } from '../middlewares/workspace';

export interface Env {
  DB: D1Database;
  TOKEN_CACHE: KVNamespace;
  R2: R2Bucket;
  PIPELINE_QUEUE: Queue;
  ANALYTICS: AnalyticsEngineDataset;
  ADMIN_EMAIL: string;
  ENCRYPTION_KEY: string;
  SENTRY_DSN?: string;
  ALLOWED_ORIGINS?: string;
  ENVIRONMENT: 'production' | 'staging' | 'development';
}

export interface User {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  workspaceId?: string;
  role?: string;
}

export type Variables = {
  user: User;
  workspace: WorkspaceContext;
  requestId: string;
};
