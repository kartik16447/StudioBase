import { Context } from 'hono';
import { WorkspaceContext } from '../middlewares/workspace';

export interface Env {
  DB: D1Database;
  TOKEN_CACHE: KVNamespace;
  R2: R2Bucket;
  PIPELINE_QUEUE: Queue;
  AUDIO_QUEUE: Queue;
  AI: Ai;
  MEDIA: any; // CloudflareMediaTransformations — no official type yet
  ANALYTICS: AnalyticsEngineDataset;
  ADMIN_EMAIL: string;
  ENCRYPTION_KEY: string;
  AUDIO_PROVIDER: string; // 'workersai' | 'elevenlabs'
  GOOGLE_CLIENT_SECRET?: string;
  SENTRY_DSN?: string;
  ALLOWED_ORIGINS?: string;
  ENVIRONMENT: 'production' | 'staging' | 'development';
  DEV_BYPASS_EMAIL?: string; // Only present in local dev via wrangler.jsonc [env.development] — never in production.
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

export type AppContext = Context<{ Bindings: Env; Variables: Variables }>;
