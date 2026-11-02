import { safeFetch } from './api';
import { API_BASE } from './config';

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // keep in sync with MAX_FILE_BYTES in the backend

// R2 requires every multipart part except the last to be >= 5 MiB.
const MIN_PART_SIZE = 8 * 1024 * 1024;
// Parts go through a Worker, whose request body tops out near 100 MB.
const MAX_PART_SIZE = 90 * 1024 * 1024;
// R2 allows at most 10,000 parts per upload; stay a little under it.
const TARGET_MAX_PARTS = 9000;

// No file-size cap, but big files need bigger parts so they fit in 10,000 parts.
function partSizeFor(fileSize: number): number {
  return Math.min(MAX_PART_SIZE, Math.max(MIN_PART_SIZE, Math.ceil(fileSize / TARGET_MAX_PARTS)));
}

// Browsers report an empty or generic file.type for some formats (mkv, mov on
// Windows, ...), so fall back to the extension.
const EXT_TO_TYPE: Record<string, string> = {
  webm: 'video/webm', mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime',
  mkv: 'video/x-matroska', ogv: 'video/ogg', '3gp': 'video/3gpp', mpg: 'video/mpeg', mpeg: 'video/mpeg',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac', weba: 'audio/webm',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
};
const KNOWN_TYPES = new Set(Object.values(EXT_TO_TYPE));

export const ACCEPTED_UPLOAD_TYPES = [...KNOWN_TYPES, ...Object.keys(EXT_TO_TYPE).map(e => `.${e}`)];

export function resolveContentType(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const type = file.type === 'image/jpg' ? 'image/jpeg' : file.type;
  if (KNOWN_TYPES.has(type)) return type;
  return EXT_TO_TYPE[ext] || null;
}

export function validateUpload(file: File): string | null {
  if (!resolveContentType(file)) return 'Unsupported file type (use video, audio or image files: MP4, MOV, WebM, MKV, MP3, WAV, M4A, PNG, JPG…)';
  if (file.size === 0) return 'File is empty';
  if (file.size > MAX_UPLOAD_BYTES) return 'File is larger than 2GB';
  return null;
}

function readVideoDurationMs(file: File): Promise<number | null> {
  return new Promise(resolve => {
    const el = document.createElement('video');
    const url = URL.createObjectURL(file);
    const done = (v: number | null) => { URL.revokeObjectURL(url); resolve(v); };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(isFinite(el.duration) ? Math.round(el.duration * 1000) : null);
    el.onerror = () => done(null);
    el.src = url;
  });
}

async function api(path: string, init: RequestInit): Promise<any> {
  const res = await safeFetch(`${API_BASE}${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export async function uploadLocalFile(
  file: File,
  opts: { workspaceId: string; accountEmail: string; folderId?: string | null; onProgress: (pct: number) => void },
): Promise<void> {
  const contentType = resolveContentType(file)!;
  const isImage = contentType.startsWith('image/');
  const isAudio = contentType.startsWith('audio/');
  const PART_SIZE = partSizeFor(file.size);
  const { key, uploadId } = await api('/uploads/init', json('POST', { workspaceId: opts.workspaceId, contentType, size: file.size }));

  try {
    const parts: { partNumber: number; etag: string }[] = [];
    for (let offset = 0, n = 1; offset < file.size; offset += PART_SIZE, n++) {
      const part = await api(
        `/uploads/part?key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=${n}`,
        { method: 'PUT', body: file.slice(offset, offset + PART_SIZE) },
      );
      parts.push({ partNumber: part.partNumber, etag: part.etag });
      opts.onProgress(Math.min(99, Math.round((Math.min(offset + PART_SIZE, file.size) / file.size) * 100)));
    }
    await api('/uploads/complete', json('POST', { key, uploadId, parts }));
  } catch (err) {
    await safeFetch(`${API_BASE}/uploads/abort`, json('POST', { key, uploadId })).catch(() => {});
    throw err;
  }

  const title = file.name.replace(/\.[^.]+$/, '') || 'Upload';
  const created = await api('/videos', json('POST', {
    fileId: key,
    workspaceId: opts.workspaceId,
    title,
    accountEmail: opts.accountEmail,
    source: 'upload',
    mediaType: isImage ? 'image' : isAudio ? 'audio' : 'video',
  }));

  const durationMs = isImage ? null : await readVideoDurationMs(file);
  await api(`/videos/${created.id}`, json('PATCH', {
    status: 'ready',
    fileSizeBytes: file.size,
    ...(durationMs ? { actualDurationMs: durationMs } : {}),
    ...(opts.folderId ? { folderId: opts.folderId } : {}),
  }));
  opts.onProgress(100);
}
