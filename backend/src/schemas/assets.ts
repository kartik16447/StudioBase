import { z } from 'zod';

export const PresignUploadSchema = z.object({
  sessionId: z.string().uuid(),
  files: z.array(z.object({
    key: z.string().min(1),
    contentType: z.string().min(1),
  })).min(1),
});

export const InitMultipartUploadSchema = z.object({
  key: z.string().min(1),
});

export const PresignPartUploadSchema = z.object({
  key: z.string().min(1),
  uploadId: z.string().min(1),
  partNumber: z.number().int().min(1),
});

export const CompleteMultipartUploadSchema = z.object({
  key: z.string().min(1),
  uploadId: z.string().min(1),
  parts: z.array(z.object({
    etag: z.string().min(1),
    partNumber: z.number().int().min(1),
  })),
});

export const RefreshAssetUrlsSchema = z.object({
  keys: z.array(z.string().min(1)).min(1),
});
