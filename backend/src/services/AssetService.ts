import { Env } from '../types/hono';

export class AssetService {
  constructor(private env: Env) {}

  async getPresignedUploadUrls(sessionId: string, files: { key: string; contentType: string }[], origin: string) {
    return files.map(f => ({
      key: f.key,
      contentType: f.contentType,
      uploadUrl: `${origin}/upload/file?key=${encodeURIComponent(f.key)}`
    }));
  }

  async put(key: string, body: ArrayBuffer | ReadableStream, contentType: string) {
    if (!key.startsWith('sessions/') && !key.startsWith('screenshots/') && !key.startsWith('videos/')) {
      throw new Error('INVALID_PATH');
    }

    return await this.env.R2.put(key, body, {
      httpMetadata: { contentType }
    });
  }

  async get(key: string) {
    const object = await this.env.R2.get(key);
    if (!object) return null;
    return object;
  }

  async delete(key: string) {
    return await this.env.R2.delete(key);
  }

  async getStorageUsage(userId: string) {
    const record = await this.env.DB.prepare(
      'SELECT r2StorageUsedBytes, r2StorageQuotaBytes FROM users WHERE id = ?'
    ).bind(userId).first() as any;

    const FREE_QUOTA = 1073741824; // 1GB
    const used = record?.r2StorageUsedBytes || 0;
    const quota = record?.r2StorageQuotaBytes || FREE_QUOTA;

    return { used, quota, percent: Math.round((used / quota) * 100) };
  }
}
