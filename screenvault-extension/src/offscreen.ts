import { OffscreenMessage, StorageAccount, SessionMetadata, BackendUser } from './types';
import {
  initUpload,
  uploadPart,
  completeUpload,
  UploadedPart,
} from './r2-upload';
import { saveChunk, recoverSession, deleteSession, getChunks, deleteChunks } from './db';
import { svLog } from './logger';

const BACKEND_URL = 'https://screenvault-backend.tushar-abf.workers.dev';
const PLAYER_BASE_URL = 'https://recorder.foyr.com/watch';

let recorder: MediaRecorder | null = null;
let activeSessionId: string | null = null;
let activeAccount: StorageAccount | null = null;
let activeCaptureStream: MediaStream | null = null;
let activeMicStream: MediaStream | null = null;
let activeAudioContext: AudioContext | null = null;
let activeUploadKey: string | null = null;
let activeUploadId: string | null = null;
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
let hasUserTitle = false;
let activeBackendVideoId: string | null = null;
let activePlayerUrl: string | null = null;
let activeEncryptedFileId: string | null = null;
let tokenPrefetched = false;

const ENABLE_PROGRESSIVE_UPLOAD = true;

// Progressive Upload State
let uploadedBytes = 0;
let nextPartNumber = 1;
let uploadParts: UploadedPart[] = [];
let uploadQueue: Promise<void> = Promise.resolve();
let progressiveEnabled = false;
let consecutiveFailures = 0;
// R2 multipart requires non-final parts to be >=5MiB.
// Buffer MediaRecorder chunks until we hit that threshold before uploading.
const MIN_UPLOAD_CHUNK = 5 * 1024 * 1024;
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
    activeUploadKey = message.fileId;
    activeUploadId = message.uploadId;
    activeSessionId = message.sessionId;
    activeAccount = message.account;
    offscreenUser = message.sv_user || null;
    offscreenAccounts = message.sv_accounts || [];
    sessionTitle = message.title || "Screen Recording";
    hasUserTitle = !!message.hasUserTitle;
    // Seeded from pre-allocation (already has the encrypted link) so the
    // finalize step never has to fall back to the raw R2 key, which the
    // proxy worker rejects by design (unlike Drive's raw file IDs, R2 keys
    // are never valid as a passthrough identifier).
    activePlayerUrl = message.playerUrl || null;
    activeEncryptedFileId = message.encryptedFileId || null;
    activeBackendVideoId = message.videoId || null;

    // Sync the new sessionId to the service worker to preserve title/context
    chrome.runtime.sendMessage({
      type: 'SAVE_SESSION_METADATA',
      sessionId: activeSessionId,
      metadata: {
        status: 'recording',
        fileId: message.fileId,
        uploadId: message.uploadId,
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
    activeUploadKey = message.fileId;
    activeUploadId = message.uploadId || null;
    activePlayerUrl = message.playerUrl || null;
    activeEncryptedFileId = message.encryptedFileId || null;
    activeBackendVideoId = message.videoId || null;
    offscreenUser = message.sv_user || null;
    offscreenAccounts = message.sv_accounts || [];
    processingSessions.add(message.sessionId);
    recoverAndUpload(message.sessionId, message.account).catch(handleError);
  }
});



// getDisplayMedia's video track label often carries the actual captured
// window/tab/screen name on supported platforms. Filter out the generic,
// non-descriptive forms Chrome falls back to (e.g. "screen:0:0") so we
// don't replace one generic title with another.
function deriveTitleFromStream(stream: MediaStream): string | null {
  const label = stream.getVideoTracks()[0]?.label?.trim();
  if (!label) return null;
  if (/^(screen|window|tab):\d+(:\d+)?$/i.test(label)) return null;
  return label;
}

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

  // Only override with the captured source's own name if the user didn't
  // type a custom title themselves — never clobber an explicit choice.
  if (!hasUserTitle) {
    const derived = deriveTitleFromStream(stream);
    if (derived) sessionTitle = derived;
  }

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

// Uploads the whole blob as a single R2 part. Used for the standard
// fallback path (progressive upload never started, or failed mid-recording).
async function uploadWholeBlob(
  blob: Blob,
  account: StorageAccount,
  onProgress: (n: number) => void
): Promise<{ url: string; accountEmail: string }> {
  try {
    let key = activeUploadKey;
    let uploadId = activeUploadId;

    if (!key || !uploadId) {
      // No pre-allocated upload session (e.g. recovery from an older session) — start one now.
      const token = await getFreshToken(account.id, false);
      const init = await initUpload(token, offscreenUser?.workspaceId || '');
      key = init.key;
      uploadId = init.uploadId;
    }

    const token = await getFreshToken(account.id, false);
    const part = await uploadPart(token, key, uploadId, 1, blob, onProgress);
    await completeUpload(token, key, uploadId, [part]);

    let meta = await chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA', sessionId: activeSessionId });
    let url = meta?.playerUrl;

    // If syncBackend failed during recording, the video record and encrypted ID won't exist yet.
    // Try to create it now that the file content is actually uploaded.
    if (!meta?.encryptedFileId && key && offscreenUser?.workspaceId) {
      try {
        const syncToken = await getFreshToken(account.id, false).catch(() => offscreenUser?.accessToken || '');
        const res = await fetch(`${BACKEND_URL}/videos`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${syncToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileId: key,
            workspaceId: offscreenUser.workspaceId,
            title: meta?.title || sessionTitle || 'Recording',
            accountEmail: account.email,
            sessionId: activeSessionId
          })
        });
        if (res.ok) {
          const data = await res.json();
          activeBackendVideoId = data.id;
          activePlayerUrl = data.playerUrl;
          activeEncryptedFileId = data.encryptedFileId;

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
      // Last resort: backend registration never succeeded, so there's no
      // encrypted ID. Never fall back to the raw R2 key here — unlike
      // Drive's file IDs, the proxy worker only accepts encrypted IDs, so
      // a raw key would just 403. Degrade to a session-only link instead;
      // the dashboard can still resolve the recording via sessionId.
      const titleToUse = meta?.title || sessionTitle || 'Recording';
      url = `${PLAYER_BASE_URL}/?title=${encodeURIComponent(titleToUse)}${activeSessionId ? `&sid=${activeSessionId}` : ''}`;
      svLog("UPLOAD_LINK_MISSING_ENCRYPTED_ID", { sessionId: activeSessionId, timestamp: Date.now() });
    }

    svLog("UPLOAD_FINAL_COMPLETE", {
      sessionId: activeSessionId,
      key,
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

  const account = accounts[0];
  if (!account) throw new Error('No account pinned to this session.');

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // Task 2: Exponential backoff (1s, 2s, 4s, 8s)
      const delay = Math.pow(2, attempt - 1) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      chrome.runtime.sendMessage({ type: 'UPLOAD_PROGRESS', progress: 0 }); // reset progress bar
    }

    try {
      return await uploadWholeBlob(blob, account, onProgress);
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

async function uploadPartWithRetry(
  token: string,
  key: string,
  uploadId: string,
  partNumber: number,
  chunk: Blob,
  maxRetries = 3
): Promise<UploadedPart> {
  let lastErr: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await uploadPart(token, key, uploadId, partNumber, chunk);
      consecutiveFailures = 0;

      svLog("UPLOAD_PART_PROGRESS", {
        sessionId: activeSessionId,
        partNumber,
        size: chunk.size,
        timestamp: Date.now()
      });

      return result;
    } catch (err: any) {
      lastErr = err;
      if (attempt === maxRetries) {
        consecutiveFailures++;
        throw err;
      }
      // Exponential backoff: 1s, 2s, 4s
      const delay = 1000 * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
      console.warn(`[SV] Part retry ${attempt + 1} at partNumber ${partNumber}`);
    }
  }
  throw lastErr;
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
  uploadedBytes = 0;
  nextPartNumber = 1;
  uploadParts = [];
  uploadQueue = Promise.resolve();
  progressiveEnabled = false;
  consecutiveFailures = 0;
  uploadChunkBuffer = [];
  uploadChunkBufferSize = 0;

  if (activeUploadKey && activeUploadId && activeAccount) {
    chrome.runtime.sendMessage({
      type: "SAVE_SESSION_METADATA",
      sessionId: activeSessionId!,
      metadata: { accountEmail: activeAccount.email }
    });

    // The upload session (key + uploadId) was already created during
    // pre-allocation, so progressive upload can start immediately —
    // no async init step needed here, unlike the old Drive flow.
    if (ENABLE_PROGRESSIVE_UPLOAD) {
      progressiveEnabled = true;
    }
  }

  let chunkCount = 0;
  let lastChunkData: Blob | null = null;

  const TOKEN_PREFETCH_MS = 8 * 60 * 1000;
  const MAX_RECORDING_MS = 10 * 60 * 1000;

  recorder.ondataavailable = (e) => {
    // Task 3: Push ONLY valid chunks (size > 0), maintain order, no duplicates
    // REMOVED !isStopping check: We MUST capture the final chunk even if we are in the process of stopping.
    if (hasFinishedChunkProcessing) {
      svLog("LATE_CHUNK_IGNORED", { sessionId: activeSessionId, size: e?.data?.size, timestamp: Date.now() });
      return;
    }
    if (e.data && e.data.size > 0 && activeSessionId) {
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

      if (progressiveEnabled && activeUploadKey && activeUploadId) {
        // Buffer until we have ≥ 5MiB — R2 rejects non-final multipart parts smaller than that
        uploadChunkBuffer.push(chunk);
        uploadChunkBufferSize += chunk.size;

        if (uploadChunkBufferSize >= MIN_UPLOAD_CHUNK) {
          const blobToUpload = new Blob(uploadChunkBuffer, { type: 'video/webm' });
          uploadChunkBuffer = [];
          uploadChunkBufferSize = 0;

          const partNumber = nextPartNumber++;
          const key = activeUploadKey;
          const uploadId = activeUploadId;

          uploadQueue = uploadQueue
            .then(async () => {
              if (!progressiveEnabled || consecutiveFailures >= 3) {
                progressiveEnabled = false;
                return;
              }
              const token = await getFreshToken(activeAccount!.id, false);
              const part = await uploadPartWithRetry(token, key!, uploadId!, partNumber, blobToUpload);
              uploadParts.push(part);
              uploadedBytes += blobToUpload.size;
              if (activeSessionId) {
                await chrome.runtime.sendMessage({
                  type: 'SAVE_SESSION_METADATA',
                  sessionId: activeSessionId,
                  metadata: { uploadedBytes }
                });
              }
            })
            .catch(err => {
              console.error('[SV][PROGRESSIVE_PART_FAIL]', err?.message, { partNumber, size: blobToUpload.size });
              progressiveEnabled = false;
            });
        }
      }
    }

    // Authoritative Limit Enforcement (Checked AFTER processing chunk)
    const elapsedMs = performance.now() - recordingStartTime;

    // STEP 3: Pre-warm token
    if (elapsedMs >= TOKEN_PREFETCH_MS && !tokenPrefetched && activeAccount) {
      tokenPrefetched = true;
      getFreshToken(activeAccount.id, false).catch(() => {});
    }

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
        key: activeUploadKey,
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
      const stopTimePerf = performance.now();
      const actualDurationMs = Math.floor(stopTimePerf - recordingStartTime);

      // 1. Critical Path: Finalize progressive upload
      await uploadQueue;

      if (progressiveEnabled && activeUploadKey && activeUploadId && activeAccount) {
        try {
          if (uploadChunkBuffer.length > 0) {
            // Send tail as the final part — R2 allows the last part to be any size.
            const tail = new Blob(uploadChunkBuffer, { type: 'video/webm' });
            uploadChunkBuffer = [];
            uploadChunkBufferSize = 0;
            const partNumber = nextPartNumber++;
            const tailToken = await getFreshToken(activeAccount.id, false);
            const part = await uploadPartWithRetry(tailToken, activeUploadKey, activeUploadId, partNumber, tail);
            uploadParts.push(part);
            uploadedBytes += tail.size;
          }

          if (uploadParts.length === 0) {
            throw new Error('No progressive data to finalize');
          }

          const duration = durationSeconds;
          const finalActualDurationMs = actualDurationMs;

          const finalToken = await getFreshToken(activeAccount.id, false).catch(() => offscreenUser?.accessToken || '');
          const completed = await completeUpload(finalToken, activeUploadKey, activeUploadId, uploadParts);
          const uploadCompleteAt = Date.now();

          svLog("PROGRESSIVE_UPLOAD_COMPLETE", {
            sessionId: activeSessionId,
            key: activeUploadKey,
            uploadedBytes: completed.size,
            timestamp: uploadCompleteAt
          });

          // STEP 4: Fire UPLOAD_COMPLETE immediately after token resolve.
          // activePlayerUrl was seeded once at recording start from
          // preAllocateUpload's own registration attempt — if THAT attempt
          // failed but syncBackend's later background retry (in
          // service-worker.ts) succeeded, the corrected playerUrl only ever
          // lands in session metadata, never back into this in-memory var.
          // Re-check metadata here so we don't ship a stale id-less link
          // when a good one was written moments after recording started.
          const latestMeta = await chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA', sessionId: activeSessionId }).catch(() => null);
          let link = latestMeta?.playerUrl || activePlayerUrl;
          if (!link) {
            // Last resort: pre-allocation never got an encrypted ID back.
            // Never fall back to the raw R2 key — the proxy worker only
            // accepts encrypted IDs. Degrade to a session-only link instead.
            const titleToUse = sessionTitle || 'Recording';
            link = `${PLAYER_BASE_URL}/?title=${encodeURIComponent(titleToUse)}${activeSessionId ? `&sid=${activeSessionId}` : ''}`;
            svLog("UPLOAD_LINK_MISSING_ENCRYPTED_ID", { sessionId: activeSessionId, timestamp: Date.now() });
          }

          chrome.runtime.sendMessage({
            type: 'UPLOAD_COMPLETE',
            url: link,
            account: activeAccount.email
          } as OffscreenMessage);

          const linkReadyAt = Date.now();

          // Update backend DB in background — the video row's fileId already
          // points at this key since it was set at creation time, so no
          // fileId swap is needed (unlike the old Drive placeholder flow).
          if (activeBackendVideoId && finalToken) {
            fetch(`${BACKEND_URL}/videos/${activeBackendVideoId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${finalToken}` },
              body: JSON.stringify({
                status: 'ready',
                duration,
                actualDurationMs: finalActualDurationMs,
                sessionId: activeSessionId,
                fileSizeBytes: completed.size
              })
            }).then(() => {
                svLog("BACKEND_FINALIZATION_COMPLETE", { sessionId: activeSessionId, timestamp: Date.now() });
            }).catch(e => {
                svLog("BACKEND_FINALIZATION_FAILED", { sessionId: activeSessionId, error: String(e) });
            });
          }


          const linkFiredAt = Date.now();

          await chrome.runtime.sendMessage({
            type: 'SAVE_SESSION_METADATA',
            sessionId: activeSessionId,
            metadata: {
              duration,
              actualDurationMs: finalActualDurationMs,
              uploadCompleteAt,
              linkFiredAt,
              linkReadyAt,
              status: 'ready'
            }
          });

          // BACKGROUND: Start Enrichment
          enrichSession(activeSessionId!, blob, activeAccount, duration, finalActualDurationMs);

          await deleteSession(currentSessionId);
          await deleteChunks(currentSessionId);
          return;
        } catch (e) {
          console.debug('[SV][PROGRESSIVE_FINALIZE_FAIL] Switching to fallback:', e);
          progressiveEnabled = false;
        }
      }

      // 2. Standard Fallback: Full blob upload
      // This is reached if progressive was never enabled or failed during finalization
      const allAccounts = await chrome.runtime.sendMessage({ type: 'GET_ACCOUNTS' });
      const primary = activeAccount || allAccounts[0];
      if (primary) {
        await processSession(currentSessionId, blob, primary, allAccounts);
      }
    } catch (e: any) {
      handleError(e);
    }
  };

  chrome.runtime.sendMessage({ type: 'CAPTURE_STARTED' } as OffscreenMessage);
  recordingStartTime = performance.now();
  // Note: activeBackendVideoId/activePlayerUrl/activeEncryptedFileId are
  // already seeded (or cleared) by the START_SCREEN/RECOVER_AND_UPLOAD
  // handler above — do not reset them here, that would wipe out the
  // pre-allocated player link before it's ever used.
  tokenPrefetched = false;
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

    // Task 3 & 4: R2 upload and validation
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
        if (activeBackendVideoId && !meta.backendSynced) {
          const updateBody: any = {
            status: 'ready',
            sessionId,
            duration: meta.duration || 0,
            actualDurationMs: meta.actualDurationMs || 0
          };
          if (sessionTitle) updateBody.title = sessionTitle;

          svLog("BACKEND_PATCH_START", {
            sessionId,
            backendVideoId: activeBackendVideoId,
            updateBody,
            timestamp: Date.now()
          });

          await fetch(`${BACKEND_URL}/videos/${activeBackendVideoId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${freshToken}`
            },
            body: JSON.stringify(updateBody)
          });

          svLog("BACKEND_PATCH_SUCCESS", {
            sessionId,
            backendVideoId: activeBackendVideoId,
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
          await fetch(`${BACKEND_URL}/usage/update`, {
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
    const fileId = meta?.fileId || activeUploadKey;

    if (fileId) {
      // BACKGROUND: Enrichment (Thumbnail + Metadata)
      enrichSession(sessionId, blob, account, meta?.duration || 0, meta?.actualDurationMs || 0);
    }

    return result;
  } catch (e: any) {
    await setSessionStatus(sessionId, 'failed');

    const errorMsg = e instanceof Error ? e.message : String(e);
    // NEW: Update backend on failure
    chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA', sessionId }).then(async (meta) => {
      if (meta?.backendVideoId && offscreenUser?.accessToken) {
        try {
          await fetch(`${BACKEND_URL}/videos/${meta.backendVideoId}`, {
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

/**
 * BACKGROUND ENRICHMENT
 * Non-blocking tasks to enhance video metadata after it's confirmed playable.
 */
async function enrichSession(
  sessionId: string,
  blob: Blob,
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

    // 2. Final Backend Patch (Polish)
    if (activeBackendVideoId) {
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
      if (sessionTitle) updateBody.title = sessionTitle;

      const patchBackend = async () => {
        const res = await fetch(`${BACKEND_URL}/videos/${activeBackendVideoId}`, {
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
        status: 'ready',
        enrichmentFinishedAt: Date.now()
      }
    });

    // 3. Latency Auditing
    const finalMeta = await chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA', sessionId });
    const latency = {
      stopToUploadComplete: (finalMeta.uploadCompleteAt || 0) - (finalMeta.stoppedAt || 0),
      stopToLinkFired: (finalMeta.linkFiredAt || 0) - (finalMeta.stoppedAt || 0),
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
