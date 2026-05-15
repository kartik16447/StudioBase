import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { authMiddleware } from '../../middlewares/auth';
import { workspaceMiddleware } from '../../middlewares/workspace';
import { HTTPException } from 'hono/http-exception';
import { AssetService } from '../../services/AssetService';

const assets = new Hono<{ Bindings: Env; Variables: Variables }>();

// 1. Presign Uploads (Requires Workspace Context)
assets.post('/presign', authMiddleware(), workspaceMiddleware(), async (c) => {
  const ws = c.get('workspace');
  const user = c.get('user');
  const { sessionId, files } = await c.req.json();
  if (!sessionId || !files?.length) throw new HTTPException(400, { message: 'sessionId and files[] required' });

  const service = new AssetService(c.env);
  const usage = await service.getStorageUsage(user.id);
  if (usage.used >= usage.quota) {
    throw new HTTPException(403, { message: 'Storage quota exceeded' });
  }

  const origin = new URL(c.req.url).origin;
  const files_out = await service.getPresignedUploadUrls(sessionId, files, origin);

  return c.json({ sessionId, files: files_out });
});

// 2. Handle File Upload (Worker Proxy)
assets.put('/file', authMiddleware(), async (c) => {
  const key = c.req.query('key');
  if (!key) throw new HTTPException(400, { message: 'key query param required' });

  const contentType = c.req.header('Content-Type') || 'application/octet-stream';
  const body = await c.req.arrayBuffer();

  const service = new AssetService(c.env);
  try {
    await service.put(key, body, contentType);
    return c.json({ success: true, key });
  } catch (err: any) {
    if (err.message === 'INVALID_PATH') throw new HTTPException(403, { message: 'Invalid upload path' });
    throw err;
  }
});

// 3. Serve Asset
assets.get('/:key{.+}', async (c) => {
  const key = c.req.param('key');
  const service = new AssetService(c.env);
  const object = await service.get(key);
  
  if (!object) throw new HTTPException(404, { message: 'Asset not found' });

  const contentType = object.httpMetadata?.contentType || 'application/octet-stream';
  return c.body(object.body as any, 200, {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=3600',
  });
});

export default assets;
