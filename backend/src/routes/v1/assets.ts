import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../../middlewares/auth';
import { workspaceMiddleware, requireRole } from '../../middlewares/workspace';
import { 
  PresignUploadSchema, 
  InitMultipartUploadSchema, 
  PresignPartUploadSchema, 
  CompleteMultipartUploadSchema, 
  RefreshAssetUrlsSchema 
} from '../../schemas/assets';
import { HTTPException } from 'hono/http-exception';

const assets = new Hono<{ Bindings: Env; Variables: Variables }>();

const FREE_QUOTA_BYTES = 1073741824; // 1GB

// Apply workspace middleware to all management routes
assets.use('/upload/*', authMiddleware(), workspaceMiddleware());
assets.use('/refresh', authMiddleware(), workspaceMiddleware());

// 1. Presign Upload (Worker Proxy)
assets.post('/upload/presign', requireRole('Member'), zValidator('json', PresignUploadSchema), async (c) => {
  const user = c.get('user');
  const ws = c.get('workspace');
  const { sessionId, files } = c.req.valid('json');

  const userRecord = await c.env.DB.prepare(
    'SELECT r2StorageUsedBytes, r2StorageQuotaBytes FROM users WHERE id = ?'
  ).bind(user.id).first() as any;

  const used = userRecord?.r2StorageUsedBytes || 0;
  const quota = userRecord?.r2StorageQuotaBytes || FREE_QUOTA_BYTES;

  if (used >= quota) {
    throw new HTTPException(403, { message: 'Storage quota exceeded' });
  }

  const backendBase = new URL(c.req.url).origin;
  const files_out = files.map((f: any) => ({
    key: f.key,
    contentType: f.contentType,
    uploadUrl: `${backendBase}/v1/assets/upload/file?key=${encodeURIComponent(f.key)}&workspaceId=${ws.id}`
  }));

  return c.json({ sessionId, files: files_out });
});

// 2. Handle File Upload (PUT)
assets.put('/upload/file', async (c) => {
  const key = c.req.query('key');
  const ws = c.get('workspace');
  
  if (!key) throw new HTTPException(400, { message: 'key query param required' });

  // Security: only allow uploads under specific prefixes
  if (!key.startsWith('sessions/') && !key.startsWith('screenshots/') && !key.startsWith('videos/')) {
    throw new HTTPException(403, { message: 'Invalid upload path' });
  }

  const contentType = c.req.header('Content-Type') || 'application/octet-stream';
  const body = await c.req.arrayBuffer();

  const uploadId = c.req.query('uploadId');
  const partNumberStr = c.req.query('partNumber');

  if (uploadId && partNumberStr) {
    const partNumber = parseInt(partNumberStr, 10);
    const multipartUpload = c.env.R2.resumeMultipartUpload(key, uploadId);
    const part = await multipartUpload.uploadPart(partNumber, body);
    return c.json({ success: true, key, etag: part.etag, partNumber, workspaceId: ws.id });
  }

  await c.env.R2.put(key, body, {
    httpMetadata: { contentType },
    customMetadata: { workspaceId: ws.id }
  });

  return c.json({ success: true, key, workspaceId: ws.id });
});

// 3. Init Multipart Upload
assets.post('/upload/multipart/init', requireRole('Member'), zValidator('json', InitMultipartUploadSchema), async (c) => {
  const { key } = c.req.valid('json');
  const multipartUpload = await c.env.R2.createMultipartUpload(key);
  return c.json({ uploadId: multipartUpload.uploadId, key });
});

// 4. Presign Part Upload
assets.post('/upload/multipart/presign-part', requireRole('Member'), zValidator('json', PresignPartUploadSchema), async (c) => {
  const { key, uploadId, partNumber } = c.req.valid('json');
  const ws = c.get('workspace');
  const backendBase = new URL(c.req.url).origin;
  const uploadUrl = `${backendBase}/v1/assets/upload/file?key=${encodeURIComponent(key)}&uploadId=${uploadId}&partNumber=${partNumber}&workspaceId=${ws.id}`;
  return c.json({ uploadUrl });
});

// 5. Complete Multipart Upload
assets.post('/upload/multipart/complete', requireRole('Member'), zValidator('json', CompleteMultipartUploadSchema), async (c) => {
  const { key, uploadId, parts } = c.req.valid('json');
  const ws = c.get('workspace');
  const multipartUpload = c.env.R2.resumeMultipartUpload(key, uploadId);
  await multipartUpload.complete(parts);
  return c.json({ success: true, key, workspaceId: ws.id });
});

// 6. Refresh Asset URLs
assets.post('/refresh', zValidator('json', RefreshAssetUrlsSchema), async (c) => {
  const { keys } = c.req.valid('json');
  const assets: Record<string, string> = {};
  for (const key of keys) {
    assets[key] = `https://assets.studiobase.app/${key}`;
  }
  return c.json({ assets });
});

// 7. Serve Asset (Public/Internal)
assets.get('/:key{.+}', async (c) => {
  const key = c.req.param('key');
  const object = await c.env.R2.get(key);
  
  if (!object) throw new HTTPException(404, { message: 'Asset not found' });

  const contentType = object.httpMetadata?.contentType || 'application/octet-stream';
  
  return new Response(object.body as any, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
});

export default assets;
