let mediaRecorder: MediaRecorder | null = null;
let videoChunks: Blob[] = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_VIDEO_RECORDING') {
    startRecording(sendResponse);
    return true; // Keep the message channel open for async response
  } else if (message.type === 'STOP_VIDEO_RECORDING') {
    stopRecording(sendResponse);
    return true; // Keep the message channel open for async response
  }
});

async function startRecording(sendResponse: (response: any) => void) {
  try {
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
      if (event.data.size > 0) {
        videoChunks.push(event.data);
      }
    };

    mediaRecorder.start();
    sendResponse({ status: 'started' });
  } catch (error) {
    console.error('getDisplayMedia error:', error);
    sendResponse({ error: 'denied' });
  }
}

function stopRecording(sendResponse: (response: any) => void) {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    sendResponse({ error: 'not_recording' });
    return;
  }

  mediaRecorder.onstop = () => {
    const videoBlob = new Blob(videoChunks, { type: 'video/webm' });
    
    // Convert Blob to Data URL to send back to service worker
    // Note: Chrome doesn't support sending Blobs directly in MV3 sendMessage
    const reader = new FileReader();
    reader.onloadend = () => {
      sendResponse({ blob: reader.result });
      // Stop all tracks in the stream
      mediaRecorder?.stream.getTracks().forEach(track => track.stop());
      mediaRecorder = null;
      videoChunks = [];
    };
    reader.readAsDataURL(videoBlob);
  };

  mediaRecorder.stop();
}
