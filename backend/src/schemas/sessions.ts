import { z } from 'zod';

export const CreateSessionSchema = z.object({
  workspaceId: z.string().uuid(),
  sessionType: z.enum(['steps', 'video']).default('steps'),
  title: z.string().max(200).optional(),
  capturedUrl: z.string().url().optional().or(z.literal('')),
  capturedTitle: z.string().max(200).optional(),
  stepCount: z.number().int().min(0).default(0),
  durationMs: z.number().int().min(0).default(0),
});

export const UpdateSessionSchema = z.object({
  status: z.enum(['uploading', 'uploaded', 'processing', 'ready', 'failed', 'credit_exhausted', 'deleted']).optional(),
  title: z.string().max(200).optional(),
  r2JsonKey: z.string().optional(),
  r2VideoKey: z.string().optional(),
  storageBytes: z.number().int().min(0).optional(),
  stepCount: z.number().int().min(0).optional(),
  durationMs: z.number().int().min(0).optional(),
  pipelinePath: z.enum(['edge', 'cloud']).optional(),
  isPublic: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
  generatedOutputs: z.record(z.any()).optional(),
});

export const GetSessionsQuerySchema = z.object({
  workspaceId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
