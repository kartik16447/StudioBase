const BACKEND_URL = 'https://screenvault-backend.karthik-upadhyay98.workers.dev';

export interface UploadedPart {
  partNumber: number;
  etag: string;
}

/**
 * Starts an R2 multipart upload for a new recording. The returned `key` is
 * the final object key for the whole recording's lifetime — unlike the old
 * Drive flow there's no separate "placeholder" file to swap out later.
 */
export async function initUpload(token: string, workspaceId: string): Promise<{ key: string; uploadId: string }> {
  const res = await fetch(`${BACKEND_URL}/uploads/init`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Token expired. Please sign in again.');
    throw new Error(`Failed to init upload: ${res.status} ${await res.text().catch(() => '')}`);
  }
  return res.json();
}

/**
 * Uploads one multipart part. R2 requires parts to be >=5MiB except the
 * final one.
 */
export async function uploadPart(
  token: string,
  key: string,
  uploadId: string,
  partNumber: number,
  chunk: Blob,
  onProgress?: (percent: number) => void
): Promise<UploadedPart> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${BACKEND_URL}/uploads/part?key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`;
    xhr.open('PUT', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (e) {
          reject(new Error('Malformed response from uploadPart'));
        }
      } else if (xhr.status === 401) {
        reject(new Error('Token expired. Please sign in again.'));
      } else {
        reject(new Error(`Part upload failed: ${xhr.status} ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during part upload'));
    xhr.send(chunk);
  });
}

/** Finalizes the R2 multipart upload once all parts are uploaded. */
export async function completeUpload(
  token: string,
  key: string,
  uploadId: string,
  parts: UploadedPart[]
): Promise<{ key: string; size: number }> {
  const res = await fetch(`${BACKEND_URL}/uploads/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, uploadId, parts }),
  });
  if (!res.ok) throw new Error(`Failed to complete upload: ${res.status} ${await res.text().catch(() => '')}`);
  return res.json();
}

/** Cleans up an in-progress multipart upload that's being abandoned. */
export async function abortUpload(token: string, key: string, uploadId: string): Promise<void> {
  await fetch(`${BACKEND_URL}/uploads/abort`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, uploadId }),
  }).catch(() => {});
}
