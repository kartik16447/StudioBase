let mediaRecorder: MediaRecorder | null = null;
let videoChunks: Blob[] = [];
let capturedBlob: Blob | null = null;

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
    blob = await captureFrame();
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
    // Focus Left Chrome -> Start 3s Debounce
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
        });

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
      });
    }
  }
}

let currentSessionId: string | null = null;
let chunkIndex = 0;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
    captureFrame().then((blob) => {
      if (blob) {
        const reader = new FileReader();
        reader.onloadend = () => {
          sendResponse({ base64data: reader.result });
        };
        reader.readAsDataURL(blob);
      } else {
        sendResponse({ error: 'Failed to capture frame' });
      }
    });
    return true;
  } else if (message.type === 'WINDOW_FOCUS_CHANGED') {
    handleFocusChange(message.isChromeFocused);
  }
});

async function startRecording(sessionId: string, sendResponse: (response: any) => void) {
  try {
    currentSessionId = sessionId;
    chunkIndex = 0;

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 } as any,
      audio: false
    });

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

async function captureFrame(): Promise<Blob | null> {
  if (!mediaRecorder) return null;
  const stream = mediaRecorder.stream;
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) return null;

  const v = document.createElement('video');
  v.srcObject = stream;
  v.muted = true;
  await v.play();

  captureCanvas.width = v.videoWidth;
  captureCanvas.height = v.videoHeight;
  
  if (captureCtx) {
    captureCtx.drawImage(v, 0, 0);
    v.srcObject = null;
    v.remove();
    
    return new Promise((resolve) => {
      captureCanvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/jpeg', 0.85);
    });
  }
  return null;
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
