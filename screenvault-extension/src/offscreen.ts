import { OffscreenMessage, StorageAccount, SessionMetadata, BackendUser } from './types';
import {
  preAllocateDriveFile,
  uploadDataToExistingFile,
  isFileReady,
  getFileMetadata,
  initResumableUploadPost,
  uploadResumableChunk,
  getUploadStatus,
  makeFilePublic,
  deleteFile,
  ensureWorkspaceMapping,
  uploadFileSimple
} from './google-drive';
import { saveChunk, recoverSession, deleteSession, getChunks, deleteChunks } from './db';
import { svLog } from './logger';

let recorder: MediaRecorder | null = null;
let activeSessionId: string | null = null;
let activeAccount: StorageAccount | null = null;
let activeCaptureStream: MediaStream | null = null;
let activeMicStream: MediaStream | null = null;
let activeAudioContext: AudioContext | null = null;
let activeFileId: string | null = null;
const processingSessions = new Set<string>();
let previewChunks: Blob[] = [];
let previewCaptured = false;
let isStopping = false;
let isRecording = false;
let maxDurationTimeout: any = null;
let recordingStartTime: number = 0;

// Passed from service worker via message
let offscreenUser: BackendUser | null = null;
let offscreenAccounts: StorageAccount[] = [];
let sessionTitle: string = "Screen Recording";
let activeFolderId: string | null = null;

const ENABLE_PROGRESSIVE_UPLOAD = true;

console.log("Offscreen context initialized");
console.log("Storage available:", !!chrome?.storage);

// Progressive Upload State
let resumableUploadUrl: string | null = null;
let uploadedBytes = 0;      // confirmed-uploaded bytes (advances on success only)
let expectedOffset = 0;     // next chunk's byte offset (advances immediately on enqueue)
let uploadQueue: Promise<void> = Promise.resolve();
let progressiveEnabled = false;
let consecutiveFailures = 0;
// Drive requires non-final chunks to be multiples of 256 KB.
// Buffer MediaRecorder chunks until we hit that threshold before uploading.
const MIN_UPLOAD_CHUNK = 256 * 1024;
let uploadChunkBuffer: Blob[] = [];
let uploadChunkBufferSize = 0;

async function getFreshToken(accountId?: string, interactive: boolean = false): Promise<string> {
  const response = await chrome.runtime.sendMessage({ 
    type: 'GET_TOKEN', 
    accountId: accountId || activeAccount?.id,
    interactive 
  });
  if (response && response.error) {
    throw new Error(response.error);
  }
  return response;
}

// Signal readiness to the service worker
chrome.runtime.sendMessage({ type: 'OFFSCREEN_READY' });

chrome.runtime.onMessage.addListener((message: OffscreenMessage, sender, sendResponse) => {
  if (message.type === 'START_SCREEN') {
    if (isRecording || (recorder && recorder.state !== 'inactive')) {
      console.warn('Recording already in progress, ignoring START_SCREEN');
      return;
    }
    activeFileId = message.fileId;
    activeSessionId = message.sessionId;
    activeAccount = message.account;
    offscreenUser = message.sv_user || null;
    offscreenAccounts = message.sv_accounts || [];
    sessionTitle = message.title || "Screen Recording";
    activeFolderId = message.folderId || null;
    
    // Sync the new sessionId to the service worker to preserve title/context
    chrome.runtime.sendMessage({
      type: 'SAVE_SESSION_METADATA',
      sessionId: activeSessionId,
      metadata: {
        status: 'recording',
        fileId: message.fileId,
        accountId: message.account.id,
        accountEmail: message.account.email,
        startedAt: Date.now(),
        title: sessionTitle
      }
    });

    startScreenRecording(message.includeMic !== false).catch(handleError);
  } else if (message.type === 'STOP') {
    activeAccount = message.account;
    stopRecording();
  } else if (message.type === 'RECOVER_AND_UPLOAD') {
    activeFileId = message.fileId;
    offscreenUser = message.sv_user || null;
    offscreenAccounts = message.sv_accounts || [];
    processingSessions.add(message.sessionId);
    recoverAndUpload(message.sessionId, message.account).catch(handleError);
  }
});



async function startScreenRecording(includeMic: boolean) {
  if (isRecording) return;
  isStopping = false;
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true,
    // Hint Chrome picker to include audio options when available.
    // Cast required because these keys are not yet in TS DOM typings.
    ...( {
      systemAudio: 'include',
      selfBrowserSurface: 'include'
    } as any)
  } as any);

  await mixMicAndStart(stream, includeMic);
}

async function mixMicAndStart(stream: MediaStream, includeMic: boolean) {
  activeCaptureStream = stream;
  if (!includeMic) {
    startMediaRecorder(stream);
    return;
  }
  try {
    // Explicit constraints prevent device-lock DOMExceptions on Mac/Windows
    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true }
    });
    activeMicStream = micStream;

    const ctx = new AudioContext();
    activeAudioContext = ctx;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const dest = ctx.createMediaStreamDestination();

    if (stream.getAudioTracks().length > 0) {
      ctx.createMediaStreamSource(stream).connect(dest);
    }
    ctx.createMediaStreamSource(micStream).connect(dest);

    const combined = new MediaStream([
      ...stream.getVideoTracks(),
      ...dest.stream.getAudioTracks()
    ]);

    startMediaRecorder(combined);
  } catch (err: any) {
    console.warn(`Microphone failed: ${err.name} - ${err.message}`);
    chrome.runtime.sendMessage({
      type: 'RECORDING_ERROR',
      message: 'Mic access failed. Recording system audio only.'
    } as OffscreenMessage);
    // Fail-safe fallback: continue recording with the original stream only.
    startMediaRecorder(stream);
  }
}

async function uploadWithFallback(
  blob: Blob,
  accounts: StorageAccount[],
  onProgress: (n: number) => void
): Promise<{ url: string; accountEmail: string }> {
  // Task 1: Hard Account Pinning - ONLY use the provided account
  const targetAccount = accounts.find(a => a.isActive);
  if (!targetAccount) throw new Error('No active account pinned to this session.');

  // We no longer loop through all accounts. We stick to the pinned one.
  const account = targetAccount;
  try {
    let fileId = activeFileId;
      
      // If we are on a fallback account OR if activeFileId was never set, create a new file
      if (account.id !== activeAccount?.id || !fileId) {
        const token = await getFreshToken(account.id, false);
        
        console.log(`[SV][OFFSCREEN_UPLOAD] Using account: ${account.email}, New file needed: ${!fileId || account.id !== activeAccount?.id}`);

        // Task 4, 5: Folder Logic per Account
        let workspaceFolderId: string | undefined;
        if (offscreenUser?.workspaceId) {
          const mapping = await ensureWorkspaceMapping(
            offscreenUser.workspaceId, 
            token, 
            account.driveRootFolderId
          );
          
          workspaceFolderId = mapping.workspaceFolderId;

          // Sync Root ID to backend if new
          if (account.driveRootFolderId !== mapping.rootId) {
            console.log(`[SV][OFFSCREEN_UPLOAD] New Root ID for ${account.email}: ${mapping.rootId}`);
            syncAccountRootFolder(account.id, mapping.rootId);
            account.driveRootFolderId = mapping.rootId; 
            chrome.runtime.sendMessage({ type: 'SYNC_ACCOUNTS', accounts: offscreenAccounts });
          }
        }

        const newFile = await preAllocateDriveFile(account, token, { folderId: workspaceFolderId });
        fileId = newFile.id;
        console.log(`[SV][OFFSCREEN_UPLOAD] Created new file: ${fileId} for account: ${account.email}`);
      }
      
      const token = await getFreshToken(account.id, false);
      console.log(`[SV][OFFSCREEN_UPLOAD] Starting data upload to ${fileId} using ${account.email}`);
      await uploadDataToExistingFile(fileId, blob, account, onProgress, token);
      
      let meta = await chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA', sessionId: activeSessionId });
      let url = meta?.playerUrl;

      // If syncBackend failed during recording, the video record and encrypted ID won't exist yet.
      // Try to create it now that the file content is actually uploaded.
      if (!meta?.encryptedFileId && fileId && offscreenUser?.workspaceId) {
        try {
          const syncToken = await getFreshToken(account.id, false).catch(() => offscreenUser?.accessToken || '');
          const res = await fetch('https://screenvault-backend.karthik-upadhyay98.workers.dev/videos', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${syncToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileId,
              workspaceId: offscreenUser.workspaceId,
              title: meta?.title || sessionTitle || 'Recording',
              accountEmail: account.email,
              sessionId: activeSessionId
            })
          });
          if (res.ok) {
            const data = await res.json();
            await chrome.runtime.sendMessage({
              type: 'SAVE_SESSION_METADATA',
              sessionId: activeSessionId,
              metadata: {
                backendVideoId: data.id,
                playerUrl: data.playerUrl,
                encryptedFileId: data.encryptedFileId,
                backendSynced: true
              }
            });
            url = data.playerUrl;
            meta = { ...meta, encryptedFileId: data.encryptedFileId };
            svLog("FALLBACK_BACKEND_SYNC_SUCCESS", { sessionId: activeSessionId, videoId: data.id, timestamp: Date.now() });
          }
        } catch (e) {
          svLog("FALLBACK_BACKEND_SYNC_FAILED", { sessionId: activeSessionId, error: String(e), timestamp: Date.now() });
        }
      }

      if (!url) {
        const idToUse = meta?.encryptedFileId || fileId;
        const titleToUse = meta?.title || sessionTitle || 'Recording';
        const PLAYER_BASE_URL = 'https://screenvault-player.pages.dev';
        url = `${PLAYER_BASE_URL}/?id=${idToUse}&title=${encodeURIComponent(titleToUse)}`;
      }

    svLog("UPLOAD_FINAL_COMPLETE", {
      sessionId: activeSessionId,
      fileId,
      url,
      method: 'standard_pinned',
      timestamp: Date.now()
    });

    return { url, accountEmail: account.email };
  } catch (err: any) {
    console.error(`[SV][UPLOAD_FAILED] Account: ${account.email}, Error: ${err.message}`);
    throw err instanceof Error ? err : new Error(String(err));
  }
}

async function uploadWithRetry(
  blob: Blob,
  accounts: StorageAccount[],
  onProgress: (n: number) => void,
  maxRetries = 3
) {
  // Task 3: Guard - Do NOT retry on empty blob
  if (!blob || blob.size === 0) {
    throw new Error('Upload aborted: Blob is empty');
  }

  svLog("UPLOAD_START", {
    sessionId: activeSessionId,
    blobSize: blob.size,
    timestamp: Date.now()
  });

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // Task 2: Exponential backoff (1s, 2s, 4s, 8s)
      const delay = Math.pow(2, attempt - 1) * 1000; 
      await new Promise(resolve => setTimeout(resolve, delay));
      chrome.runtime.sendMessage({ type: 'UPLOAD_PROGRESS', progress: 0 }); // reset progress bar
    }
    
    try {
      return await uploadWithFallback(blob, accounts, onProgress);
    } catch (err: any) {
      lastError = err;
      const message = err.message || '';
      
      // Task 3: Failure detection
      // Check for 4xx errors - do NOT retry (except 408 timeout)
      const statusMatch = message.match(/failed: (\d+)/);
      const status = statusMatch ? parseInt(statusMatch[1]) : null;
      
      const isRetriable = 
        message.includes('Network error') || 
        message.includes('timeout') || 
        (status && status >= 500) ||
        status === 408;

      if (!isRetriable) {
        console.warn(`Non-retriable error encountered (status: ${status || 'unknown'}), aborting retries: ${message}`);
        break;
      }

      console.warn(`Upload attempt ${attempt + 1} failed: ${message}`);
    }
  }
  
  // Task 4: Final failure state handled by throwing the error
  throw lastError || new Error('Upload failed after multiple attempts');
}

async function uploadChunkWithRetry(url: string, chunk: Blob, offset: number, isFinal: boolean, maxRetries = 3): Promise<{ done: boolean; fileId?: string }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await uploadResumableChunk(url, chunk, offset, isFinal);
      consecutiveFailures = 0;

      svLog("UPLOAD_CHUNK_PROGRESS", {
        sessionId: activeSessionId,
        offset,
        size: chunk.size,
        isFinal,
        done: result.done,
        timestamp: Date.now()
      });

      return result;
    } catch (err: any) {
      const is503 = err?.message?.includes('503');

      if (is503) {
        // Drive returned 503 but may have persisted the bytes server-side.
        // Query status before retrying to avoid re-sending bytes Drive already has.
        try {
          // +1 so Drive treats this as incomplete and returns 308 (not 200/finalize)
          const probedTotal = offset + chunk.size + 1;
          const statusRes = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Range': `bytes */${probedTotal}` }
          });
          if (statusRes.status === 308) {
            const range = statusRes.headers.get('Range');
            const received = range ? parseInt(range.match(/bytes=0-(\d+)/)?.[1] ?? '-1', 10) + 1 : 0;
            if (received >= offset + chunk.size) {
              consecutiveFailures = 0;
              return { done: false }; // Drive has all bytes — no retry needed
            }
          }
        } catch {}
      }

      if (attempt === maxRetries) {
        consecutiveFailures++;
        throw err;
      }
      // Exponential backoff: 1s, 2s, 4s
      const delay = 1000 * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
      console.warn(`[SV] Chunk retry ${attempt + 1} at offset ${offset}`);
    }
  }
  return { done: false };
}

async function generateThumbnail(blob: Blob, retry = true): Promise<string | null> {
  try {
    const dataUrl = await new Promise<string | null>((resolve) => {
      const video = document.createElement('video');
      video.muted = true;
      video.src = URL.createObjectURL(blob);
      
      const timeout = setTimeout(() => {
        video.onerror = null;
        video.onseeked = null;
        video.onloadedmetadata = null;
        URL.revokeObjectURL(video.src);
        resolve(null);
      }, 2000);

      video.onloadedmetadata = () => {
        if (isFinite(video.duration) && video.duration > 0.5) {
          video.currentTime = 0.5;
        } else {
          video.currentTime = 0.1;
        }
      };

      video.onseeked = () => {
        clearTimeout(timeout);
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx && canvas.width > 0) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          URL.revokeObjectURL(video.src);
          resolve(dataUrl);
        } else {
          URL.revokeObjectURL(video.src);
          resolve(null);
        }
      };

      video.onerror = () => {
        clearTimeout(timeout);
        URL.revokeObjectURL(video.src);
        resolve(null);
      };
    });

    if (!dataUrl && retry) {
      console.log('Thumbnail generation failed, retrying once...');
      return generateThumbnail(blob, false);
    }
    return dataUrl;
  } catch (e) {
    return null;
  }
}



function startMediaRecorder(stream: MediaStream) {
  if (isRecording) return;
  isRecording = true;
  isStopping = false;
  let hasFinishedChunkProcessing = false;

  chrome.runtime.sendMessage({
    type: 'CAPTURE_STARTED',
    sessionId: activeSessionId
  });

  const preferredCodec = 'video/webm;codecs=vp8,opus';
  const fallbackCodec = 'video/webm';
  const mimeType = MediaRecorder.isTypeSupported(preferredCodec) ? preferredCodec : fallbackCodec;

  recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 2_500_000, 
    audioBitsPerSecond: 128_000
  });

  // Handle recorder errors
  recorder.onerror = (event) => {
    console.error('MediaRecorder error:', event);
    handleError(new Error('MediaRecorder error occurred'));
    stopRecording();
  };

  // Handle unexpected stream termination
  stream.getTracks().forEach(track => {
    track.onended = () => {
      if (isRecording && !isStopping) {
        console.warn('Track ended unexpectedly, stopping recording');
        stopRecording();
      }
    };
  });

  // Reset progressive state
  resumableUploadUrl = null;
  uploadedBytes = 0;
  expectedOffset = 0;
  uploadQueue = Promise.resolve();
  progressiveEnabled = false;
  consecutiveFailures = 0;
  uploadChunkBuffer = [];
  uploadChunkBufferSize = 0;

  if (activeFileId && activeAccount) {
    chrome.runtime.sendMessage({
      type: "SAVE_SESSION_METADATA",
      sessionId: activeSessionId!,
      metadata: { accountEmail: activeAccount.email }
    });

    if (ENABLE_PROGRESSIVE_UPLOAD) {
      const now = new Date().toISOString().slice(0, 10);
      const fileName = `screenvault-${now}.webm`;
      getFreshToken(activeAccount.id, false)
        .then(token => initResumableUploadPost(token, fileName, activeFolderId || undefined))
        .then(async (url) => {
          resumableUploadUrl = url;
          progressiveEnabled = true;
          if (activeSessionId) {
            await chrome.runtime.sendMessage({
              type: 'SAVE_SESSION_METADATA',
              sessionId: activeSessionId,
              metadata: {
                uploadUrl: url,
                uploadedBytes: 0,
                accountEmail: activeAccount?.email || offscreenUser?.email
              }
            });
          }
        })
        .catch(e => {
          console.error('Failed to init progressive upload:', e);
          progressiveEnabled = false;
        });
    }
  }

  let chunkCount = 0;
  let lastChunkData: Blob | null = null;

  const MAX_RECORDING_MS = 10 * 60 * 1000;

  recorder.ondataavailable = (e) => {
    // Task 3: Push ONLY valid chunks (size > 0), maintain order, no duplicates
    // REMOVED !isStopping check: We MUST capture the final chunk even if we are in the process of stopping.
    if (hasFinishedChunkProcessing) {
      svLog("LATE_CHUNK_IGNORED", { sessionId: activeSessionId, size: e?.data?.size, timestamp: Date.now() });
      return;
    }
    if (e.data && e.data.size > 0 && activeSessionId) {
      console.log(`[SV][CHUNK] Received chunk: ${e.data.size} bytes for session: ${activeSessionId}`);
      // Capture first 2 seconds for instant preview
      if (!previewCaptured) {
        previewChunks.push(e.data);
        if (previewChunks.length >= 2) {
          previewCaptured = true;
        }
      }

      // Basic deduplication check - though MediaRecorder rarely emits identical blobs
      if (lastChunkData && lastChunkData.size === e.data.size) {
         // Potential duplicate, but blobs are unique references. 
         // We'll trust the size check and stream state for now.
      }
      
      const chunk = e.data;
      const currentSession = activeSessionId;
      const currentIndex = chunkCount++;
      lastChunkData = chunk;

      saveChunk(currentSession, currentIndex, chunk).catch(err => {
        console.error('Failed to save chunk to IndexedDB:', err);
      });

      if (progressiveEnabled && resumableUploadUrl) {
        // Buffer until we have ≥ 256 KB — Drive rejects non-final chunks smaller than that
        uploadChunkBuffer.push(chunk);
        uploadChunkBufferSize += chunk.size;

        if (uploadChunkBufferSize >= MIN_UPLOAD_CHUNK) {
          const blobToUpload = new Blob(uploadChunkBuffer, { type: 'video/webm' });
          uploadChunkBuffer = [];
          uploadChunkBufferSize = 0;

          const offset = expectedOffset;
          expectedOffset += blobToUpload.size;

          uploadQueue = uploadQueue
            .then(async () => {
              if (!progressiveEnabled || !resumableUploadUrl || consecutiveFailures >= 3) {
                progressiveEnabled = false;
                return;
              }
              const result = await uploadChunkWithRetry(resumableUploadUrl!, blobToUpload, offset, false);
              uploadedBytes += blobToUpload.size;
              if (activeSessionId) {
                await chrome.runtime.sendMessage({
                  type: 'SAVE_SESSION_METADATA',
                  sessionId: activeSessionId,
                  metadata: { uploadedBytes: offset + blobToUpload.size }
                });
              }
              if (result.done) {
                // Drive closed the session early (returned 200/201) — all data committed
                progressiveEnabled = false;
              }
            })
            .catch(err => {
              console.error('[SV][PROGRESSIVE_CHUNK_FAIL]', err?.message, { offset, size: blobToUpload.size });
              progressiveEnabled = false;
              resumableUploadUrl = null;
            });
        }
      }
    }

    // Authoritative Limit Enforcement (Checked AFTER processing chunk)
    const elapsedMs = performance.now() - recordingStartTime;
    if (elapsedMs >= MAX_RECORDING_MS && !isStopping) {
      console.warn(`[SV][LIMIT] Recording reached ${Math.floor(elapsedMs / 1000)}s. Triggering stop.`);
      stopRecording();
    }
  };

    recorder.onstop = async () => {
      const stopTimePerf = performance.now();
      const actualDurationMs = Math.floor(stopTimePerf - recordingStartTime);
      const durationSeconds = Math.floor(actualDurationMs / 1000);

      hasFinishedChunkProcessing = true;
      // Task 4: Guard against multiple finalizing calls
      if (!isRecording) return;
      isRecording = false;
      isStopping = true;

      svLog("OFFSCREEN_ONSTOP_TRIGGERED", {
        sessionId: activeSessionId,
        fileId: activeFileId,
        actualDurationMs,
        timestamp: Date.now()
      });

      if (activeSessionId) {
        await chrome.runtime.sendMessage({ 
          type: 'SET_SESSION_STATUS', 
          sessionId: activeSessionId, 
          status: 'finalizing' 
        });
        await chrome.runtime.sendMessage({ 
          type: 'SAVE_SESSION_METADATA', 
          sessionId: activeSessionId, 
          metadata: { 
            stoppedAt: Date.now(),
            actualDurationMs,
            duration: durationSeconds,
            processingStartedAt: Date.now() 
          } 
        });
      }

    if (maxDurationTimeout) {
      clearTimeout(maxDurationTimeout);
      maxDurationTimeout = null;
    }

    // Step 2: Critical Path (Duration calculation + Final Blob preparation)
    const chunks = await getChunks(activeSessionId!);
    const blob = new Blob(chunks, { type: 'video/webm' });
    
    // Captured chunks for preview generation (moved to enrichment)
    const previewBlobForEnrichment = previewChunks.length > 0 ? new Blob(previewChunks, { type: 'video/webm' }) : null;
    previewChunks = []; 
    previewCaptured = false;

    // Task 5 & 6: Clean up all tracks safely
    const tracks = [
      ...(activeCaptureStream?.getTracks() || []),
      ...(activeMicStream?.getTracks() || []),
      ...(stream?.getTracks() || [])
    ];
    tracks.forEach(t => {
      try { t.stop(); } catch (e) {}
    });

    if (activeAudioContext) {
      activeAudioContext.close().catch(() => {});
    }
    
    activeCaptureStream = null;
    activeMicStream = null;
    activeAudioContext = null;

    if (!activeSessionId) return;
    const currentSessionId = activeSessionId;

    try {
      let finalResult: { url: string; accountEmail: string } | null = null;
      const stopTimePerf = performance.now();
      const actualDurationMs = Math.floor(stopTimePerf - recordingStartTime);

      // 1. Critical Path: Finalize progressive upload
      await uploadQueue;

      if (progressiveEnabled && resumableUploadUrl && activeAccount) {
        try {
          let newFileId: string | undefined;

          if (uploadChunkBuffer.length > 0) {
            // Send tail as the FINAL chunk — Drive returns new file ID in the 200/201 body
            const tail = new Blob(uploadChunkBuffer, { type: 'video/webm' });
            uploadChunkBuffer = [];
            uploadChunkBufferSize = 0;
            const offset = expectedOffset;
            expectedOffset += tail.size;
            const result = await uploadChunkWithRetry(resumableUploadUrl, tail, offset, true /* FINAL */);
            uploadedBytes = expectedOffset;
            newFileId = result.fileId;
          } else if (uploadedBytes > 0) {
            // All data already uploaded as non-final chunks — finalize via status query.
            // Drive returns 200/201 with file body when all bytes are present.
            const status = await getUploadStatus(resumableUploadUrl, uploadedBytes);
            if (status.received < uploadedBytes) {
              throw new Error(`Upload incomplete: server has ${status.received}/${uploadedBytes} bytes`);
            }
            newFileId = status.fileId;
          } else {
            throw new Error('No progressive data to finalize');
          }

          if (!newFileId) {
            throw new Error('Drive did not return new file ID after upload');
          }

          const uploadCompleteAt = Date.now();
          const meta = await chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA', sessionId: activeSessionId });
          const duration = meta?.duration || durationSeconds;
          const finalActualDurationMs = meta?.actualDurationMs || actualDurationMs;

          svLog("PROGRESSIVE_UPLOAD_COMPLETE", {
            sessionId: activeSessionId,
            newFileId,
            placeholderFileId: activeFileId,
            uploadedBytes,
            timestamp: uploadCompleteAt
          });

          // Fetch fresh token for Drive + backend calls
          let freshToken: string;
          try {
            freshToken = await getFreshToken(activeAccount.id, false);
          } catch {
            freshToken = offscreenUser?.accessToken || '';
          }

          // Update backend DB: swap fileId to the real uploaded file.
          // The player URL (encrypted placeholder ID) still works because the proxy
          // resolves via encryptedFileId → video record → current fileId.
          if (meta?.backendVideoId && freshToken) {
            await fetch(`https://screenvault-backend.karthik-upadhyay98.workers.dev/videos/${meta.backendVideoId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${freshToken}` },
              body: JSON.stringify({
                fileId: newFileId,
                status: 'ready',
                duration,
                actualDurationMs: finalActualDurationMs,
                sessionId: activeSessionId
              })
            });
          }

          // Delete placeholder in background (no content, just metadata)
          if (activeFileId && freshToken) {
            deleteFile(activeFileId, freshToken).catch(() => {});
          }

          const backendFinalizedAt = Date.now();

          let link = meta?.playerUrl;
          if (!link) {
            const idToUse = meta?.encryptedFileId || activeFileId;
            const titleToUse = meta?.title || sessionTitle || 'Recording';
            link = `https://screenvault-player.pages.dev/?id=${idToUse}&title=${encodeURIComponent(titleToUse)}`;
          }

          // CRITICAL PATH COMPLETE: Show Link
          chrome.runtime.sendMessage({
            type: 'UPLOAD_COMPLETE',
            url: link,
            account: activeAccount.email
          } as OffscreenMessage);

          const linkReadyAt = Date.now();

          await chrome.runtime.sendMessage({
            type: 'SAVE_SESSION_METADATA',
            sessionId: activeSessionId,
            metadata: {
              duration,
              actualDurationMs: finalActualDurationMs,
              uploadCompleteAt,
              backendFinalizedAt,
              linkReadyAt,
              status: 'ready'
            }
          });

          // BACKGROUND: Start Enrichment
          enrichSession(activeSessionId!, blob, previewBlobForEnrichment, activeAccount, duration, finalActualDurationMs);

          await deleteSession(currentSessionId);
          await deleteChunks(currentSessionId);
          return;
        } catch (e) {
          console.debug('[SV][PROGRESSIVE_FINALIZE_FAIL] Switching to fallback:', e);
          resumableUploadUrl = null;
        }
      }

      // 2. Standard Fallback: Full blob upload
      // This is reached if progressive was never enabled or failed during finalization
      if (!finalResult) {
        const allAccounts = await chrome.runtime.sendMessage({ type: 'GET_ACCOUNTS' });
        const primary = activeAccount || allAccounts[0];
        if (primary) {
          await processSession(currentSessionId, blob, primary, allAccounts);
        }
      }
    } catch (e: any) {
      handleError(e);
    }
  };

  chrome.runtime.sendMessage({ type: 'CAPTURE_STARTED' } as OffscreenMessage);
  recordingStartTime = performance.now();
  recorder.start(1000); // 1s chunks
}

function stopRecording() {
  if (isStopping) return;
  isStopping = true;

  if (maxDurationTimeout) {
    clearTimeout(maxDurationTimeout);
    maxDurationTimeout = null;
  }

  // Stop all tracks to release hardware and clear browser indicators
  const tracks = [
    ...(activeCaptureStream?.getTracks() || []),
    ...(activeMicStream?.getTracks() || []),
    ...(recorder?.stream?.getTracks() || [])
  ];
  tracks.forEach(t => {
    try { t.stop(); } catch (e) {}
  });

  if (recorder && recorder.state !== 'inactive') {
    recorder.stop();
  }
}

function handleError(error: any) {
  isRecording = false;
  chrome.runtime.sendMessage({ 
    type: 'RECORDING_ERROR', 
    message: error?.message || 'Recording failed' 
  });
}

async function recoverAndUpload(sessionId: string, account: StorageAccount) {
  try {
    const blob = await recoverSession(sessionId);
    const retryAccounts = offscreenAccounts.length > 0 ? offscreenAccounts : await chrome.runtime.sendMessage({ type: 'GET_ACCOUNTS' });
    await processSession(sessionId, blob, account, retryAccounts);
  } catch (e: any) {
    handleError(e);
  }
}

export async function getSessionStatus(sessionId: string): Promise<SessionMetadata['status'] | null> {
  const meta = await chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA', sessionId });
  return meta?.status || null;
}

async function setSessionStatus(sessionId: string, status: SessionMetadata['status']) {
  // Task 4: Prevent invalid transitions
  const meta = await chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA', sessionId });
  const currentStatus = meta?.status;

  if (currentStatus === 'ready') return; // Terminal state
  if (currentStatus === 'uploading' && status === 'recording') return; // Invalid regression

  chrome.runtime.sendMessage({ type: 'SET_SESSION_STATUS', sessionId, status });
}

async function processSession(sessionId: string, blob: Blob, account: StorageAccount, allAccounts: StorageAccount[] = []): Promise<{ url: string; accountEmail: string } | null> {
  // Task 5: Duplicate protection
  const currentMeta = await chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA', sessionId });
  const currentStatus = currentMeta?.status;

  svLog("PROCESS_SESSION_START", {
    sessionId,
    backendVideoId: currentMeta?.backendVideoId,
    fileId: currentMeta?.fileId,
    accountEmail: account.email,
    currentStatus,
    timestamp: Date.now()
  });

  if (currentStatus === 'ready') {
    return null;
  }
  if (currentStatus === 'uploading' && processingSessions.has(sessionId)) {
    console.warn(`Session ${sessionId} is already being uploaded. Ignoring duplicate request.`);
    return null;
  }
  
  processingSessions.add(sessionId);

  try {
    const blobUrl = URL.createObjectURL(blob);
    
    // Notify service worker that we have a file for download
    chrome.runtime.sendMessage({ 
      type: 'RECORDING_FINISHED', 
      blobUrl 
    } as OffscreenMessage);

    // Task 6: Hard Account Pinning - only use the specified account
    const retryAccounts = [account];

    // Task 3 & 4: Drive upload and validation
    const result = await uploadWithRetry(blob, retryAccounts, (progress) => {
      chrome.runtime.sendMessage({ type: 'UPLOAD_PROGRESS', progress } as OffscreenMessage);
    });

    if (!result || !result.url) {
       throw new Error('Upload failed: No result URL returned');
    }

    // INSTANT FEEDBACK: Send completion immediately once upload completes (before polling/sync)
    chrome.runtime.sendMessage({ 
      type: 'UPLOAD_COMPLETE', 
      url: result.url,
      account: result.accountEmail
    } as OffscreenMessage);

    await setSessionStatus(sessionId, 'ready');

    // NEW: Update backend on success
    chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA', sessionId }).then(async (meta) => {
      if (!meta) return;
      
      const user = offscreenUser;
      if (!user?.accessToken) {
        console.warn("Backend sync skipped: Missing offscreenUser session data");
        return;
      }

      try {
        // Always fetch a fresh token so stale sv_user.accessToken doesn't cause 401/400
        let freshToken: string;
        try {
          freshToken = await getFreshToken(activeAccount?.id, false);
        } catch {
          freshToken = user.accessToken;
        }

        // 1. Update Video Status
        if (meta.backendVideoId && !meta.backendSynced) {
          const updateBody: any = {
            status: 'ready',
            sessionId,
            duration: meta.duration || 0,
            actualDurationMs: meta.actualDurationMs || 0
          };
          if (sessionTitle) updateBody.title = sessionTitle;

          svLog("BACKEND_PATCH_START", {
            sessionId,
            backendVideoId: meta.backendVideoId,
            updateBody,
            timestamp: Date.now()
          });

          await fetch(`https://screenvault-backend.karthik-upadhyay98.workers.dev/videos/${meta.backendVideoId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${freshToken}`
            },
            body: JSON.stringify(updateBody)
          });

          svLog("BACKEND_PATCH_SUCCESS", {
            sessionId,
            backendVideoId: meta.backendVideoId,
            timestamp: Date.now()
          });

          await chrome.runtime.sendMessage({
            type: "SAVE_SESSION_METADATA",
            sessionId,
            metadata: { backendSynced: true }
          });
        }

        // 2. Track Usage Stats
        if (meta && !meta.usageSynced && user.workspaceId) {
          await fetch('https://screenvault-backend.karthik-upadhyay98.workers.dev/usage/update', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${freshToken}`
            },
            body: JSON.stringify({
              workspaceId: user.workspaceId,
              duration: meta.duration || 0,
              recordedAt: meta.startedAt || Date.now(),
              sessionId
            })
          });
          
          await chrome.runtime.sendMessage({
            type: "SAVE_SESSION_METADATA",
            sessionId,
            metadata: { usageSynced: true }
          });
        }
      } catch (err) {
        console.warn("Non-critical backend update failed:", err);
      }
    }).catch(e => console.warn('Backend meta fetch failed:', e));

    const meta = await chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA', sessionId });
    const fileId = meta?.fileId || activeFileId;

    if (fileId) {
      // BACKGROUND: Enrichment (Thumbnail + Preview + Metadata)
      enrichSession(sessionId, blob, null, account, meta?.duration || 0, meta?.actualDurationMs || 0);
    }

    return result;
  } catch (e: any) {
    await setSessionStatus(sessionId, 'failed');

    const errorMsg = e instanceof Error ? e.message : String(e);
    // NEW: Update backend on failure
    chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA', sessionId }).then(async (meta) => {
      if (meta?.backendVideoId && offscreenUser?.accessToken) {
        try {
          await fetch(`https://screenvault-backend.karthik-upadhyay98.workers.dev/videos/${meta.backendVideoId}`, {
            method: 'PATCH',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${offscreenUser.accessToken}`
            },
            body: JSON.stringify({ 
              status: 'failed',
              error: errorMsg,
              sessionId
            })
          });
        } catch (err) {
          console.warn('Backend failure update failed:', err);
        }
      }
    }).catch(() => {});
    // Task 2: Cleanup on failure
    await deleteChunks(sessionId).catch(() => {});
    handleError(e);
    return null;
  } finally {
    processingSessions.delete(sessionId);
  }
}

async function syncWorkspaceFolder(workspaceId: string, driveFolderId: string) {
  try {
    if (!offscreenUser?.accessToken) return;
    
    await fetch(`https://screenvault-backend.karthik-upadhyay98.workers.dev/workspaces/${workspaceId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${offscreenUser.accessToken}`
      },
      body: JSON.stringify({ driveFolderId })
    });
    
    console.log(`Workspace ${workspaceId} mapped to Drive folder ${driveFolderId}`);
  } catch (err) {
    console.warn('Failed to sync workspace folder to backend:', err);
  }
}

async function syncAccountRootFolder(accountId: string, driveRootFolderId: string) {
  try {
    if (!offscreenUser?.accessToken) return;
    
    await fetch(`https://screenvault-backend.karthik-upadhyay98.workers.dev/accounts/${accountId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${offscreenUser.accessToken}`
      },
      body: JSON.stringify({ driveRootFolderId })
    });
    
    console.log(`Account ${accountId} root folder mapped to ${driveRootFolderId}`);
  } catch (err) {
    console.warn('Failed to sync account root folder to backend:', err);
  }
}

/**
 * BACKGROUND ENRICHMENT
 * Non-blocking tasks to enhance video metadata after it's confirmed playable.
 */
async function enrichSession(
  sessionId: string, 
  blob: Blob, 
  previewBlob: Blob | null, 
  account: StorageAccount,
  duration: number,
  actualDurationMs: number
) {
  let enrichmentFinished = false;
  const watchdog = setTimeout(async () => {
    if (!enrichmentFinished) {
      svLog("ENRICHMENT_TIMEOUT", { sessionId, timestamp: Date.now() });
      await chrome.runtime.sendMessage({ type: 'SET_SESSION_STATUS', sessionId, status: 'failed_enrichment' });
    }
  }, 60000);

  try {
    await chrome.runtime.sendMessage({ type: 'SET_SESSION_STATUS', sessionId, status: 'enriching' });
    svLog("ENRICHMENT_START", { sessionId, timestamp: Date.now() });

    // 1. Generate Thumbnail
    let thumbnailUrl: string | undefined;
    try {
      thumbnailUrl = await generateThumbnail(blob) || undefined;
    } catch (err) {
      console.warn('[ENRICH] Thumbnail failed:', err);
    }
    
    // 2. Upload Preview Clip
    let previewUrl: string | undefined;
    if (previewBlob) {
      try {
        const driveRootFolderId = await chrome.runtime.sendMessage({ type: 'GET_WORKSPACE_FOLDER' });
        const previewFileId = await uploadFileSimple(previewBlob, `preview-${Date.now()}.webm`, account, driveRootFolderId);
        previewUrl = `https://drive.google.com/file/d/${previewFileId}/preview`;
      } catch (err) {
        console.warn('[ENRICH] Preview failed:', err);
      }
    }

    // 3. Final Backend Patch (Polish)
    const meta = await chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA', sessionId });
    if (meta?.backendVideoId) {
      let enrichToken: string;
      try {
        enrichToken = await getFreshToken(account?.id, false);
      } catch {
        enrichToken = offscreenUser?.accessToken || '';
      }

      const updateBody: any = {
        status: 'ready',
        duration,
        actualDurationMs
      };
      if (thumbnailUrl) updateBody.thumbnailUrl = thumbnailUrl;
      if (previewUrl) updateBody.previewUrl = previewUrl;
      if (sessionTitle) updateBody.title = sessionTitle;

      const patchBackend = async () => {
        const res = await fetch(`https://screenvault-backend.karthik-upadhyay98.workers.dev/videos/${meta.backendVideoId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${enrichToken}`
          },
          body: JSON.stringify(updateBody)
        });
        if (!res.ok) throw new Error(`Patch failed with status ${res.status}`);
      };

      try {
        await patchBackend();
      } catch (err) {
        console.warn('[ENRICH] First patch failed, retrying once...', err);
        try {
          await new Promise(r => setTimeout(r, 1000));
          await patchBackend();
        } catch (retryErr) {
          console.error('[ENRICH] Patch retry failed, skipping to preserve usability.', retryErr);
        }
      }
    }

    enrichmentFinished = true;
    clearTimeout(watchdog);

    await chrome.runtime.sendMessage({ 
      type: 'SAVE_SESSION_METADATA', 
      sessionId, 
      metadata: { 
        thumbnailUrl,
        previewUrl,
        status: 'ready',
        enrichmentFinishedAt: Date.now()
      } 
    });
    
    // 4. Latency Auditing
    const finalMeta = await chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA', sessionId });
    const latency = {
      stopToUploadComplete: (finalMeta.uploadCompleteAt || 0) - (finalMeta.stoppedAt || 0),
      stopToBackendFinalized: (finalMeta.backendFinalizedAt || 0) - (finalMeta.stoppedAt || 0),
      stopToLinkReady: (finalMeta.linkReadyAt || 0) - (finalMeta.stoppedAt || 0),
      stopToEnrichmentFinished: (finalMeta.enrichmentFinishedAt || 0) - (finalMeta.stoppedAt || 0),
      totalDuration: finalMeta.actualDurationMs || 0
    };

    svLog("ENRICHMENT_SUCCESS", { 
      sessionId, 
      latency,
      timestamp: Date.now() 
    });
    
    // Cleanup local chunks now that everything is synced
    await deleteChunks(sessionId).catch(() => {});
    chrome.runtime.sendMessage({ type: 'DELETE_SESSION', sessionId });

  } catch (err) {
    enrichmentFinished = true;
    clearTimeout(watchdog);
    console.error('[ENRICH] Failed:', err);
    svLog("ENRICHMENT_FAILURE", { sessionId, error: String(err), timestamp: Date.now() });
    await chrome.runtime.sendMessage({ type: 'SET_SESSION_STATUS', sessionId, status: 'failed_enrichment' });
  }
}
