import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { authMiddleware } from '../../middlewares/auth';
import { workspaceMiddleware } from '../../middlewares/workspace';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { AssetService } from '../../services/AssetService';
import { AuditService } from '../../services/AuditService';

const assets = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Request Schemas ─────────────────────────────────────────────────────────

const PresignSchema = z.object({
  sessionId: z.string().min(1),
  files: z.array(z.object({
    key: z.string().min(1),
    contentType: z.string().min(1),
  })).min(1),
});

const MultipartInitSchema = z.object({
  key: z.string().min(1),
});

const MultipartCompleteSchema = z.object({
  key: z.string().min(1),
  uploadId: z.string().min(1),
  parts: z.array(z.object({
    partNumber: z.number().int().min(1),
    etag: z.string().min(1),
  })).min(1),
});

const RefreshSchema = z.object({
  keys: z.array(z.string().min(1)).min(1),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

// 1. Presign Uploads (Requires Workspace Context)
assets.post('/presign', authMiddleware(), workspaceMiddleware(), zValidator('json', PresignSchema), async (c) => {
  const ws = c.get('workspace');
  const user = c.get('user');
  const { sessionId, files } = c.req.valid('json');

  const service = new AssetService(c.env);
  const usage = await service.getStorageUsage(user.id);
  if (usage.used >= usage.quota) {
    throw new HTTPException(403, { message: 'Storage quota exceeded' });
  }

  const origin = new URL(c.req.url).origin;
  const files_out = await service.getPresignedUploadUrls(sessionId, files, origin);

  return c.json({ sessionId, files: files_out });
});

// 2. Init Multipart Upload
assets.post('/multipart/init', authMiddleware(), zValidator('json', MultipartInitSchema), async (c) => {
  const { key } = c.req.valid('json');
  const service = new AssetService(c.env);
  try {
    const upload = await service.createMultipartUpload(key);
    return c.json({ uploadId: upload.uploadId, key });
  } catch (err: any) {
    if (err.message === 'INVALID_PATH') throw new HTTPException(403, { message: 'Invalid upload path' });
    throw err;
  }
});

// 3. Complete Multipart Upload
assets.post('/multipart/complete', authMiddleware(), zValidator('json', MultipartCompleteSchema), async (c) => {
  const { key, uploadId, parts } = c.req.valid('json');
  const service = new AssetService(c.env);
  const audit = new AuditService(c.env, c.executionCtx);

  try {
    const multipartUpload = await service.resumeMultipartUpload(key, uploadId);
    await multipartUpload.complete(parts);

    await audit.record({
      eventName: 'asset.upload_completed',
      userId: c.get('user').id,
      properties: { key, method: 'multipart' },
    });

    return c.json({ success: true, key });
  } catch (err: any) {
    throw new HTTPException(500, { message: err.message });
  }
});

// 4. Handle File Upload (Worker Proxy / Part Upload) — body is raw binary, no JSON schema
assets.put('/file', authMiddleware(), async (c) => {
  const key = c.req.query('key');
  const uploadId = c.req.query('uploadId');
  const partNumberStr = c.req.query('partNumber');

  if (!key) throw new HTTPException(400, { message: 'key query param required' });

  const contentType = c.req.header('Content-Type') || 'application/octet-stream';
  const body = await c.req.arrayBuffer();
  const service = new AssetService(c.env);

  try {
    if (uploadId && partNumberStr) {
      const partNumber = parseInt(partNumberStr, 10);
      const multipartUpload = await service.resumeMultipartUpload(key, uploadId);
      const part = await multipartUpload.uploadPart(partNumber, body);
      return c.json({ success: true, key, etag: part.etag, partNumber });
    } else {
      await service.put(key, body, contentType);
      return c.json({ success: true, key });
    }
  } catch (err: any) {
    if (err.message === 'INVALID_PATH') throw new HTTPException(403, { message: 'Invalid upload path' });
    throw err;
  }
});

// 5. Refresh Asset URLs
assets.post('/refresh', authMiddleware(), zValidator('json', RefreshSchema), async (c) => {
  const { keys } = c.req.valid('json');

  // In our architecture, /assets/:key is already a stable proxy,
  // so "refreshing" is mostly for client-side awareness or legacy compatibility.
  const origin = new URL(c.req.url).origin;
  const refreshed = keys.map(key => ({
    key,
    url: `${origin}/v1/assets/${key}`,
  }));

  return c.json({ refreshed });
});

// 6. Serve Asset — authMiddleware() added (Task 3: prevent unauthenticated R2 reads)
assets.get('/:key{.+}', authMiddleware(), async (c) => {
  const key = c.req.param('key');
  if (!key) throw new HTTPException(400, { message: 'Asset key missing' });

  const service = new AssetService(c.env);
  const object = await service.get(key);

  if (!object) throw new HTTPException(404, { message: 'Asset not found' });

  const contentType = object.httpMetadata?.contentType || 'application/octet-stream';
  return c.body(object.body as any, 200, {
    'Content-Type': contentType,
    'Cache-Control': 'private, max-age=3600',
  });
});

export default assets;
