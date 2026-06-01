let mediaRecorder: MediaRecorder | null = null;
let videoChunks: Blob[] = [];
let capturedBlob: Blob | null = null;
let lastDesktopFrame: Blob | null = null;

// Singleton canvas for frame grabbing
const captureCanvas = document.createElement('canvas');
const captureCtx = captureCanvas.getContext('2d', { alpha: false, desynchronized: true });

// ─── Desktop Activity State Machine ──────────────────────────
let activeDesktopSession = false;
let desktopStartTime = 0;
let debounceTimer: any = null;
let anchorTimer: any = null;
let anchorIndex = 0;

const ADAPTIVE_ANCHOR_SCHEDULE = [15000, 105000, 300000]; // 15s, +1m45s (2m), +3m (5m)
const MAX_ANCHORS = 10;

async function emitDesktopEvent(eventType: string, payload: any, includeScreenshot: boolean = false) {
  let blob: Blob | null = null;
  if (includeScreenshot) {
    // Use buffered frame if available (captured at the moment of exit), otherwise capture fresh
    blob = lastDesktopFrame || await captureFrame();
    lastDesktopFrame = null; // Consume the buffer to prevent memory leaks
  }

  chrome.runtime.sendMessage({
    type: 'SAVE_DESKTOP_EVENT',
    eventType,
    payload,
    blob
  }).catch(() => {});
}

function clearDesktopTimers() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (anchorTimer) {
    clearTimeout(anchorTimer);
    anchorTimer = null;
  }
}

function scheduleNextAnchor() {
  if (anchorIndex >= ADAPTIVE_ANCHOR_SCHEDULE.length || anchorIndex >= MAX_ANCHORS) {
    // Optional: steady state 5m heartbeat if we wanted to go beyond schedule
    return;
  }

  const nextDelay = ADAPTIVE_ANCHOR_SCHEDULE[anchorIndex];
  anchorTimer = setTimeout(async () => {
    console.log(`🧭 [Offscreen] Adaptive Anchor #${anchorIndex + 1} triggered.`);
    await emitDesktopEvent('desktop_anchor', {
      timestamp: Date.now(),
      anchorIndex: anchorIndex + 1,
      context: 'desktop'
    }, true);

    anchorIndex++;
    scheduleNextAnchor();
  }, nextDelay);
}

function handleFocusChange(isChromeFocused: boolean) {
  if (!mediaRecorder || mediaRecorder.state !== 'recording') return;

  if (!isChromeFocused) {
    // Immediate "Focus Lost" Probe
    console.log("🧭 [Offscreen] Focus lost. Probing video stream for immediate anchor...");
    emitDesktopEvent('desktop_focus_lost', {
      timestamp: Date.now(),
      context: 'desktop'
    }, true);

    // Focus Left Chrome -> Start 3s Debounce for stable Desktop session
    if (!activeDesktopSession && !debounceTimer) {
      console.log("🧭 [Offscreen] Focus lost. Starting 3s debounce...");
      debounceTimer = setTimeout(async () => {
        console.log("🧭 [Offscreen] Debounce passed. Entering Desktop mode.");
        activeDesktopSession = true;
        desktopStartTime = Date.now();
        anchorIndex = 0;

        // Boundary Event
        await emitDesktopEvent('context_switch', {
          context: 'desktop',
          timestamp: desktopStartTime
        }, true);

        // First Anchor
        await emitDesktopEvent('desktop_anchor', {
          timestamp: desktopStartTime,
          anchorIndex: 0,
          context: 'desktop'
        }, true);

        scheduleNextAnchor();
      }, 3000);
    }
  } else {
    // Focus Returned to Chrome
    console.log("🧭 [Offscreen] Focus returned to Chrome. Cleaning up desktop state.");
    const wasActive = activeDesktopSession;
    
    clearDesktopTimers();
    activeDesktopSession = false;

    if (wasActive) {
      emitDesktopEvent('context_switch', {
        context: 'browser',
        timestamp: Date.now()
      }, true);
    }
  }
}

let currentSessionId: string | null = null;
let chunkIndex = 0;
let pendingStream: MediaStream | null = null; // stream acquired via GET_STREAM before session starts

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ── GET_STREAM: called BEFORE session starts so window picker appears first ──
  if (message.type === 'GET_STREAM') {
    navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 } as any, audio: false })
      .then(stream => {
        pendingStream = stream;
        sendResponse({ status: 'ready' });
      })
      .catch(err => {
        // NotAllowedError = denied/cancelled by user
        sendResponse({ error: err.name === 'NotAllowedError' ? 'denied' : 'cancelled' });
      });
    return true; // keep channel open for async response
  }

  if (message.type === 'START_VIDEO_RECORDING') {
    startRecording(message.sessionId, sendResponse);
    return true;
  } else if (message.type === 'STOP_VIDEO_RECORDING') {
    clearDesktopTimers();
    activeDesktopSession = false;
    stopRecording(sendResponse);
    return true;
  } else if (message.type === 'UPLOAD_VIDEO') {
    uploadVideo(message.uploadUrl, message.token, sendResponse);
    return true;
  } else if (message.type === 'GET_FRAME') {
    const processFrame = async (blob: Blob | null) => {
      if (blob) {
        const reader = new FileReader();
        reader.onloadend = () => {
          sendResponse({ base64data: reader.result });
        };
        reader.readAsDataURL(blob);
      } else {
        sendResponse({ error: 'Failed to capture frame' });
      }
    };

    if (lastDesktopFrame) {
      console.log("📸 [Offscreen] Serving buffered frame to Service Worker.");
      processFrame(lastDesktopFrame);
      lastDesktopFrame = null; // Consume
    } else {
      captureFrame().then(processFrame);
    }
    return true; 
  } else if (message.type === 'WINDOW_FOCUS_CHANGED') {
    handleFocusChange(message.isChromeFocused);
  } else if (message.type === 'CAPTURE_CURRENT_FRAME_NOW') {
    captureFrame().then(blob => {
      lastDesktopFrame = blob;
      console.log("📸 [Offscreen] Buffered frame for focus-lost event.");
    });
  }
});

async function startRecording(sessionId: string, sendResponse: (response: any) => void) {
  try {
    currentSessionId = sessionId;
    chunkIndex = 0;

    // Use the stream pre-acquired by GET_STREAM (window picker already shown).
    // Fall back to a fresh getDisplayMedia call only if pendingStream is missing.
    let stream = pendingStream;
    pendingStream = null;
    if (!stream) {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 } as any,
        audio: false
      });
    }

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    mediaRecorder = new MediaRecorder(stream, { mimeType });
    videoChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0 && currentSessionId) {
        const reader = new FileReader();
        reader.onloadend = () => {
          // Stream chunk immediately to IndexedDB via Service Worker
          chrome.runtime.sendMessage({
            type: 'SAVE_CHUNK',
            sessionId: currentSessionId,
            index: chunkIndex,
            base64data: reader.result
          });
          chunkIndex++;
        };
        reader.readAsDataURL(event.data);
      }
    };

    mediaRecorder.start(5000); // 5-second time slices for durability
    chrome.runtime.sendMessage({ type: 'OFFSCREEN_READY' });
    sendResponse({ status: 'started' });
  } catch (error) {
    console.error('getDisplayMedia error:', error);
    sendResponse({ error: 'denied' });
  }
}

async function captureCleanFrame(): Promise<Blob | null> {
  // 1. Wait for 150ms to ensure the OS has finished the window transition repaint
  await new Promise(r => setTimeout(r, 150));
  
  // 2. Snap the frame
  const blob = await captureFrame(); 
  
  // 3. Validation: If the blob is too small (e.g., < 5KB), it's likely a black/blank frame
  if (blob && blob.size < 5000) {
    console.warn("⚠️ [Offscreen] Captured frame too small, likely black. Retrying once...");
    await new Promise(r => setTimeout(r, 100));
    return captureFrame();
  }
  return blob;
}

async function captureFrame(): Promise<Blob | null> {
  if (!mediaRecorder) return null;
  const stream = mediaRecorder.stream;
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) return null;

  // Use a temporary video element to probe the stream
  const v = document.createElement('video');
  v.srcObject = stream;
  v.muted = true;
  
  return new Promise((resolve) => {
    v.onloadedmetadata = () => {
      v.play().then(() => {
        captureCanvas.width = v.videoWidth;
        captureCanvas.height = v.videoHeight;
        
        if (captureCtx) {
          captureCtx.drawImage(v, 0, 0);
          v.srcObject = null;
          v.remove();
          
          captureCanvas.toBlob((blob) => {
            resolve(blob);
          }, 'image/jpeg', 0.85);
        } else {
          v.srcObject = null;
          v.remove();
          resolve(null);
        }
      });
    };
    v.onerror = () => {
      v.remove();
      resolve(null);
    };
    // Safety timeout
    setTimeout(() => {
      if (v.parentNode) v.remove();
      resolve(null);
    }, 1500);
  });
}

function stopRecording(sendResponse: (response: any) => void) {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    sendResponse({ error: 'not_recording' });
    return;
  }

  mediaRecorder.onstop = () => {
    // Stop all tracks in the stream
    mediaRecorder?.stream.getTracks().forEach(track => track.stop());
    mediaRecorder = null;
    videoChunks = [];

    sendResponse({ status: 'stopped', finalChunkIndex: chunkIndex });
    currentSessionId = null;
  };

  mediaRecorder.stop();
}

async function uploadVideo(uploadUrl: string, token: string, sendResponse: (response: any) => void) {
  // Logic will be replaced in the next step to read from IndexedDB
  sendResponse({ error: 'Multipart uploader implementation pending' });
}
