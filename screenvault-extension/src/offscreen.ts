import { OffscreenMessage, StorageAccount, SessionMetadata, BackendUser } from './types';
import { 
  preAllocateDriveFile, 
  uploadDataToExistingFile, 
  isFileReady, 
  getFileMetadata,
  initResumableUpload, 
  uploadResumableChunk,
  getUploadStatus,
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

// Passed from service worker via message
let offscreenUser: BackendUser | null = null;
let offscreenAccounts: StorageAccount[] = [];
let sessionTitle: string = "Screen Recording";

const ENABLE_RESUME = false;

console.log("Offscreen context initialized");
console.log("Storage available:", !!chrome?.storage);

// Progressive Upload State
let resumableUploadUrl: string | null = null;
let uploadedBytes = 0;
let uploadQueue: Promise<void> = Promise.resolve();
let progressiveEnabled = false;
let consecutiveFailures = 0;

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
  // Task 1: Identify active account (Saving)
  const sortedAccounts = [...accounts].sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0));
  const primaryTry = sortedAccounts[0];
  if (accounts.length === 0) {
    throw new Error('No connected accounts. Please connect a Google Drive account.');
  }

  let lastError: Error | null = null;
  for (const account of sortedAccounts) {
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
      
      const meta = await chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA', sessionId: activeSessionId });
      let url = meta?.playerUrl;
      
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
        method: 'standard_fallback',
        timestamp: Date.now()
      });

      return { url, accountEmail: account.email };
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Reset activeAccount to null so next iteration definitely creates a new file if this one failed
      activeAccount = null; 
    }
  }

  throw lastError || new Error('All connected accounts failed to upload.');
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
      // Check for existing resumable URL in metadata for the current session
      if (ENABLE_RESUME && activeSessionId) {
        const meta = await chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA', sessionId: activeSessionId });
        if (meta?.uploadUrl && !meta.status?.includes('ready')) {
          console.warn('Attempting to resume existing upload...');
          try {
            const serverOffset = await getUploadStatus(meta.uploadUrl, blob.size);
            if (serverOffset < blob.size) {
              const remaining = blob.slice(serverOffset);
              await uploadResumableChunk(meta.uploadUrl, remaining, serverOffset, true);
              
              const PLAYER_BASE_URL = 'https://screenvault-player.pages.dev';
              const fileId = meta.fileId || activeFileId;
              const idToUse = meta.encryptedFileId || fileId;
              const title = meta.title || 'Screen Recording';
              const url = meta.playerUrl || `${PLAYER_BASE_URL}/?id=${idToUse}&title=${encodeURIComponent(title)}`;

              svLog("UPLOAD_FINAL_COMPLETE", {
                sessionId: activeSessionId,
                fileId,
                url,
                method: 'resumable_resume',
                timestamp: Date.now()
              });

              return { 
                url, 
                accountEmail: accounts[0].email 
              };
            } else {
               // Already finished?
              const fileId = meta.fileId || activeFileId;
              const idToUse = meta.encryptedFileId || fileId;
              const title = meta.title || 'Screen Recording';
              const url = meta.playerUrl || `https://screenvault-player.pages.dev/?id=${idToUse}&title=${encodeURIComponent(title)}`;

              svLog("UPLOAD_FINAL_COMPLETE", {
                sessionId: activeSessionId,
                fileId,
                url,
                method: 'resumable_already_finished',
                timestamp: Date.now()
              });

              return { 
                url, 
                accountEmail: accounts[0].email 
              };
            }
          } catch (e) {
            console.warn('Resume failed, falling back to fresh upload:', e);
          }
        }
      }
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

async function uploadChunkWithRetry(url: string, chunk: Blob, offset: number, isFinal: boolean, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await uploadResumableChunk(url, chunk, offset, isFinal);
      consecutiveFailures = 0; // Reset on any success
      
      svLog("UPLOAD_CHUNK_PROGRESS", {
        sessionId: activeSessionId,
        offset,
        size: chunk.size,
        isFinal,
        timestamp: Date.now()
      });

      return;
    } catch (err) {
      if (attempt === maxRetries) {
        consecutiveFailures++;
        throw err;
      }
      const delay = attempt === 0 ? 500 : 1000;
      await new Promise(r => setTimeout(r, delay));
      console.debug(`Chunk upload retry ${attempt + 1} for offset ${offset}`);
    }
  }
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
  uploadQueue = Promise.resolve();
  progressiveEnabled = false;
  consecutiveFailures = 0;

  if (activeFileId && activeAccount) {
    // Smart Improvement: Track last used account via message
    if (activeAccount) {
      chrome.runtime.sendMessage({
        type: "SAVE_SESSION_METADATA",
        sessionId: activeSessionId!,
        metadata: { accountEmail: activeAccount.email }
      });
    }

    getFreshToken(activeAccount.id, false)
      .then(token => initResumableUpload(activeFileId!, token))
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

  let chunkCount = 0;
  let lastChunkData: Blob | null = null;

  // Max recording duration: 10 minutes
  if (maxDurationTimeout) clearTimeout(maxDurationTimeout);
  maxDurationTimeout = setTimeout(() => {
    console.warn('Max recording duration reached (10 mins). Stopping.');
    stopRecording();
  }, 10 * 60 * 1000);

  recorder.ondataavailable = (e) => {
    // Task 3: Push ONLY valid chunks (size > 0), maintain order, no duplicates
    if (e.data && e.data.size > 0 && activeSessionId && !isStopping) {
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
        const offset = uploadedBytes;
        uploadedBytes += chunk.size;
        uploadQueue = uploadQueue
          .then(() => {
            if (!progressiveEnabled || !resumableUploadUrl || consecutiveFailures >= 3) {
              progressiveEnabled = false;
              return;
            }
            const currentOffset = offset;
            return uploadChunkWithRetry(resumableUploadUrl!, chunk, currentOffset, false).then(async () => {
              if (activeSessionId) {
                await chrome.runtime.sendMessage({
                  type: 'SAVE_SESSION_METADATA',
                  sessionId: activeSessionId,
                  metadata: { uploadedBytes: currentOffset + chunk.size }
                });
              }
            });
          })
          .catch(err => {
            console.debug('Progressive upload degraded, switching to fallback:', err);
            progressiveEnabled = false;
            resumableUploadUrl = null;
          });
      }
    }
  };

  recorder.onstop = async () => {
    // Task 4: Guard against multiple finalizing calls
    if (!isRecording) return;
    isRecording = false;
    isStopping = true;

    svLog("OFFSCREEN_ONSTOP_TRIGGERED", {
      sessionId: activeSessionId,
      fileId: activeFileId,
      timestamp: Date.now()
    });

    if (activeSessionId) {
      await chrome.runtime.sendMessage({ 
        type: 'SET_SESSION_STATUS', 
        sessionId: activeSessionId, 
        status: 'uploading' 
      });
      await chrome.runtime.sendMessage({ 
        type: 'SAVE_SESSION_METADATA', 
        sessionId: activeSessionId, 
        metadata: { processingStartedAt: Date.now() } 
      });
    }

    if (maxDurationTimeout) {
      clearTimeout(maxDurationTimeout);
      maxDurationTimeout = null;
    }

    // Calculate and save duration
    let duration = 0;
    if (activeSessionId) {
      const meta = await chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA', sessionId: activeSessionId });
      duration = meta?.startedAt ? Math.floor((Date.now() - meta.startedAt) / 1000) : 0;
      await chrome.runtime.sendMessage({ 
        type: 'SAVE_SESSION_METADATA', 
        sessionId: activeSessionId, 
        metadata: { duration } 
      });
    }

    // Finalize recording and upload
    const chunks = await getChunks(activeSessionId!);
    const blob = new Blob(chunks, { type: 'video/webm' });
    
    // Create preview blob from first ~2 seconds
    const previewBlob = previewChunks.length > 0 ? new Blob(previewChunks, { type: 'video/webm' }) : null;
    previewChunks = []; // Clear for next time
    previewCaptured = false;
    
    // Step 2: Background post-processing (Thumbnail + Preview + Backend Sync)
    // We do NOT await this to prevent loader delay
    (async () => {
      try {
        const thumbnailDataUrl = await generateThumbnail(blob);
        let previewUrl: string | undefined = undefined;

        // Upload preview clip if captured
        if (previewBlob && activeAccount) {
          try {
             const driveRootFolderId = await chrome.runtime.sendMessage({ type: 'GET_WORKSPACE_FOLDER' });
             const previewFileId = await uploadFileSimple(previewBlob, `preview-${Date.now()}.webm`, activeAccount, driveRootFolderId);
             previewUrl = `https://drive.google.com/file/d/${previewFileId}/preview`;
          } catch (err) {
             console.warn('Preview upload failed:', err);
          }
        }

        if (activeSessionId) {
          await chrome.runtime.sendMessage({ 
            type: 'SAVE_SESSION_METADATA', 
            sessionId: activeSessionId, 
            metadata: { 
              thumbnailUrl: thumbnailDataUrl,
              previewUrl: previewUrl
            } 
          });
          
          const meta = await chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA', sessionId: activeSessionId });
          if (meta?.backendVideoId && offscreenUser?.accessToken) {
            const updateBody: any = {
                status: 'ready',
                thumbnailUrl: thumbnailDataUrl,
                duration: duration,
                sessionId: activeSessionId
            };
            if (previewUrl) updateBody.previewUrl = previewUrl;

            await fetch(`https://screenvault-backend.karthik-upadhyay98.workers.dev/videos/${meta.backendVideoId}`, {
              method: 'PATCH',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${offscreenUser.accessToken}`
              },
              body: JSON.stringify(updateBody)
            });

            await chrome.runtime.sendMessage({
              type: 'SAVE_SESSION_METADATA',
              sessionId: activeSessionId,
              metadata: { backendSynced: true }
            });
          }
        }
      } catch (e) {
        console.warn('Background post-processing failed:', e);
      }
    })();

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

      // 1. Try to finalize progressive upload if active
      if (progressiveEnabled && resumableUploadUrl && activeAccount) {
        try {
          const meta = await chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA', sessionId: activeSessionId });
          let link = meta?.playerUrl;

          if (!link) {
            const idToUse = meta?.encryptedFileId || activeFileId;
            const titleToUse = meta?.title || sessionTitle || 'Recording';
            const PLAYER_BASE_URL = 'https://screenvault-player.pages.dev';
            link = `${PLAYER_BASE_URL}/?id=${idToUse}&title=${encodeURIComponent(titleToUse)}`;
          }

          // Finalize the upload in the background
          const empty = new Blob([], { type: 'video/webm' });
          await uploadChunkWithRetry(resumableUploadUrl, empty, uploadedBytes, true);
          
          // SUCCESS: Send completion ONLY after final chunk is accepted
          chrome.runtime.sendMessage({ 
            type: 'UPLOAD_COMPLETE', 
            url: link,
            account: activeAccount.email
          } as OffscreenMessage);
          
          await setSessionStatus(currentSessionId, 'ready');
          await deleteSession(currentSessionId);
          await deleteChunks(currentSessionId);
          return; // EXIT: Standard upload not needed
        } catch (e) {
          console.debug('Progressive finalization failed, switching to standard upload fallback:', e);
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

    // Filter and order accounts for fallback: primary first, then others
    const retryAccounts = [account];
    if (allAccounts.length > 0) {
      const others = allAccounts.filter(a => a.id !== account.id);
      retryAccounts.push(...others);
    }

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
        // 1. Update Video Status
        if (meta.backendVideoId && !meta.backendSynced) {
          const updateBody: any = { status: 'ready', sessionId };
          if (sessionTitle) updateBody.title = sessionTitle;

          svLog("BACKEND_PATCH_START", {
            sessionId,
            backendVideoId: meta.backendVideoId,
            updateBody,
            timestamp: Date.now()
          });

          // FIX: Direct fetch
          await fetch(`https://screenvault-backend.karthik-upadhyay98.workers.dev/videos/${meta.backendVideoId}`, {
            method: 'PATCH',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${user.accessToken}`
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
          // FIX: Direct fetch instead of safeFetch to avoid storage error
          await fetch('https://screenvault-backend.karthik-upadhyay98.workers.dev/usage/update', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${user.accessToken}`
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
      let isReady = false;
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const token = await getFreshToken(account.id, false);
        isReady = await isFileReady(fileId, token);
        if (isReady) break;
      }

      if (isReady) {
        await setSessionStatus(sessionId, 'ready');
        
        // Final backend update with thumbnail and title
        const token = await getFreshToken(account.id, false);
        const driveMeta = await getFileMetadata(fileId, token);
        const meta = await chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA', sessionId });
        
        if (meta?.backendVideoId) {
          try {
            // Priority: Keep locally generated thumbnail if available
            const finalUpdate: any = { 
              status: 'ready',
              title: sessionTitle,
              sessionId
            };

            // Only use drive thumbnail if we don't already have one locally synced
            if (!meta.thumbnailUrl && driveMeta?.thumbnailLink) {
              finalUpdate.thumbnailUrl = driveMeta.thumbnailLink;
            }

            // FIX: Direct fetch instead of safeFetch
            await fetch(`https://screenvault-backend.karthik-upadhyay98.workers.dev/videos/${meta.backendVideoId}`, {
              method: 'PATCH',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${account.accessToken}`
              },
              body: JSON.stringify(finalUpdate)
            });
          } catch (err) {
            console.warn('Final metadata update failed:', err);
          }
        }
      }
    }

    // Task 1: Cleanup on success
    await deleteChunks(sessionId);
    
    // NEW: Notify service worker to remove session metadata NOW that sync is done
    chrome.runtime.sendMessage({ type: 'DELETE_SESSION', sessionId });

    return result;
  } catch (e: any) {
    await setSessionStatus(sessionId, 'failed');

    const errorMsg = e instanceof Error ? e.message : String(e);
    // NEW: Update backend on failure
    chrome.runtime.sendMessage({ type: 'GET_SESSION_METADATA', sessionId }).then(async (meta) => {
      if (meta?.backendVideoId && !meta.backendSynced) {
        const user = offscreenUser;
        if (user?.accessToken) {
          try {
            // FIX: Direct fetch instead of safeFetch to avoid storage access in offscreen context
            await fetch(`https://screenvault-backend.karthik-upadhyay98.workers.dev/videos/${meta.backendVideoId}`, {
              method: 'PATCH',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.accessToken}`
              },
              body: JSON.stringify({ 
                status: 'failed',
                error: errorMsg,
                sessionId
              })
            });
            
            await chrome.runtime.sendMessage({
              type: "SAVE_SESSION_METADATA",
              sessionId,
              metadata: { backendSynced: true }
            });
          } catch (err) {
            console.warn('Backend failure update failed:', err);
          }
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
