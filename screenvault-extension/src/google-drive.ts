import { StorageAccount, PreAllocationResult } from './types';

/**
 * Phase 1: Create an empty file metadata and set permissions.
 * Returns the file ID and the shareable player URL immediately.
 */
export async function preAllocateDriveFile(account: StorageAccount, accessToken?: string, options?: { folderId?: string }): Promise<PreAllocationResult> {
  const token = accessToken || account.accessToken;
  const now = new Date().toISOString().slice(0, 10);
  const fileName = `screenvault-${now}.webm`;
  
  console.log(`[SV][PRE_ALLOCATE_START] Account: ${account.email}, Folder: ${options?.folderId || 'Root'}`);

  // 1. Create metadata-only file
  const metadata: any = { name: fileName, mimeType: 'video/webm' };
  
  // Task 4: Ensure upload uses workspace folder as parent
  const { folderId } = options || {};
  if (folderId) {
    metadata.parents = [folderId];
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    console.error(`[SV][PRE_ALLOCATE_FAILED] Status: ${createRes.status}, Error: ${errText}`);
    if (createRes.status === 401) {
      throw new Error('Token expired. Please reconnect your Google Drive account.');
    }
    throw new Error(`Pre-allocation failed: ${createRes.status} ${errText}`);
  }

  const file = await createRes.json();
  console.log(`[SV][PRE_ALLOCATE_SUCCESS] FileId: ${file.id}`);

  // 2. Set public permission (Ensures the link is shareable)
  try {
    const title = fileName.replace(".webm", "");
    const customUrl = await makeFilePublic(file.id, token, title, account.email);
    return {
      id: file.id,
      url: customUrl,
      fileName,
      account
    };
  } catch (err) {
    console.warn('Error setting permissions or getting URL:', err);
    throw err;
  }
}

/**
 * Phase 2: Upload the actual video data to the existing file.
 */
export async function uploadDataToExistingFile(
  fileId: string,
  blob: Blob,
  account: StorageAccount,
  onProgress: (percent: number) => void,
  accessToken?: string
): Promise<void> {
  const token = accessToken || account.accessToken;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    // PATCH with uploadType=media to target the specific file ID
    xhr.open('PATCH', `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', 'video/webm');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        // Track progress up to 100% since permission is already handled
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        onProgress(100);
        resolve();
      } else {
        if (xhr.status === 401) {
          reject(new Error('Token expired. Please reconnect your Google Drive account.'));
          return;
        }
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(blob);
  });
}

/**
 * Lightweight multipart upload for small files (like previews)
 */
export async function uploadFileSimple(
  blob: Blob,
  fileName: string,
  account: StorageAccount,
  folderId?: string
): Promise<string> {
  const token = account.accessToken;
  const metadata: any = {
    name: fileName,
    mimeType: 'video/webm'
  };
  if (folderId) metadata.parents = [folderId];

  const metadataBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
  const form = new FormData();
  form.append('metadata', metadataBlob);
  form.append('file', blob);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: form
  });

  if (!res.ok) throw new Error(`Preview upload failed: ${await res.text()}`);
  const file = await res.json();
  
  // Make public so preview works for anyone with the link
  await makeFilePublic(file.id, token, fileName.replace('.webm', ''));
  
  return file.id;
}

// Add this new function to src/google-drive.ts
export async function makeFilePublic(fileId: string, accessToken: string, title: string = "Screen Recording", accountEmail?: string): Promise<string> {
  console.log(`[SV][MAKE_PUBLIC_START] fileId: ${fileId}, Account: ${accountEmail || 'Unknown'}`);
  
  // Grant anyone-with-link read access
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[SV][MAKE_PUBLIC_FAILED] Status: ${res.status}, Error: ${errText}`);
    throw new Error(`Failed to set permissions: ${res.status}`);
  }

  console.log(`[SV][MAKE_PUBLIC_SUCCESS] fileId: ${fileId}`);

  // Return the custom Cloudflare player URL
  const PLAYER_BASE_URL = 'https://screenvault-player.pages.dev';
  const encodedTitle = encodeURIComponent(title);
  return `${PLAYER_BASE_URL}/?id=${fileId}&title=${encodedTitle}`;
}

export async function getFileMetadata(fileId: string, accessToken: string): Promise<any> {
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=size,thumbnailLink`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function isFileReady(fileId: string, accessToken: string): Promise<boolean> {
  try {
    const data = await getFileMetadata(fileId, accessToken);
    if (!data) return false;
    return parseInt(data.size || '0', 10) > 0;
  } catch (err) {
    return false;
  }
}

export async function initResumableUpload(fileId: string, accessToken: string): Promise<string> {
  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=resumable`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Upload-Content-Type': 'video/webm',
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Failed to init resumable upload: ${res.status} ${errText}`);
  }
  const location = res.headers.get('Location');
  if (!location) throw new Error('Drive did not return a resumable upload URL');
  return location;
}

// Returns true if Drive signalled the upload is complete (200/201),
// false if it returned 308 (more chunks expected).
export async function uploadResumableChunk(
  uploadUrl: string,
  chunk: Blob,
  startByte: number,
  isFinal: boolean
): Promise<boolean> {
  const endByte = startByte + chunk.size - 1;
  const totalStr = isFinal ? (startByte + chunk.size).toString() : '*';

  // Do NOT set Content-Length manually — the browser sets it from the body.
  // Setting it explicitly can confuse Drive's session state.
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Range': `bytes ${startByte}-${endByte}/${totalStr}`,
    },
    body: chunk
  });

  if (res.status === 308) return false; // more chunks expected
  if (res.ok) return true;              // 200/201 — Drive considers upload complete
  throw new Error(`Chunk upload failed: ${res.status}`);
}

export async function getUploadStatus(uploadUrl: string, totalSize: number): Promise<number> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Range': `bytes */${totalSize}`
    }
  });

  if (res.status === 308) {
    const range = res.headers.get('Range');
    if (!range) return 0;
    const match = range.match(/bytes=0-(\d+)/);
    return match ? parseInt(match[1], 10) + 1 : 0;
  } else if (res.status === 200 || res.status === 201) {
    return totalSize;
  }
  return 0;
}

export async function deleteFile(fileId: string, accessToken: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    if (res.status === 404) return; // Already deleted
    throw new Error(`Delete failed: ${res.status}`);
  }
}

export async function renameFile(fileId: string, accessToken: string, newName: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: newName }),
  });
  if (!res.ok) {
    throw new Error(`Rename failed: ${res.status}`);
  }
}

export async function getQuota(accessToken: string): Promise<{ limit: number, usage: number }> {
  const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error('Failed to fetch quota');
  const data = await res.json();
  return {
    limit: parseInt(data.storageQuota?.limit || '0', 10),
    usage: parseInt(data.storageQuota?.usage || '0', 10)
  };
}
export async function getOrCreateFolder(name: string, token: string, parentId?: string): Promise<string> {
  const query = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentId ? ` and '${parentId}' in parents` : ''}`;
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (data.files?.length > 0) return data.files[0].id;

  const meta: any = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) meta.parents = [parentId];
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(meta)
  });
  return (await createRes.json()).id;
}

/**
 * Ensures root ScreenVault folder and workspace subfolder exist for a specific account.
 * Returns { rootId, workspaceFolderId }
 */
export async function ensureWorkspaceMapping(workspaceId: string, token: string, existingRootId?: string): Promise<{ rootId: string, workspaceFolderId: string }> {
  // 1. Get/Create Root "ScreenVault" folder for THIS account
  let rootId = existingRootId;
  if (!rootId) {
    rootId = await getOrCreateFolder('ScreenVault', token);
  }
  
  // 2. Get/Create Workspace folder "ws-{workspaceId}" inside this account's root
  const workspaceFolderId = await getOrCreateFolder(`ws-${workspaceId}`, token, rootId);
  
  return { rootId, workspaceFolderId };
}
