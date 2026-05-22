/**
 * AudioTrackCompiler
 * 
 * Compiles individual step voiceover tracks into a single unified WAV Audio Buffer
 * using OfflineAudioContext (Mono, 44100Hz) and generates a local Blob URL.
 */

export interface AudioTrackItem {
  url: string;
  startMs: number;
  durationMs: number;
}

/**
 * Encodes an AudioBuffer into a 16-bit Mono PCM WAV Blob.
 */
function bufferToWav(buffer: AudioBuffer): Blob {
  const sampleRate = buffer.sampleRate;
  const format = 1; // Raw PCM
  const bitDepth = 16;
  
  // Mix down or just extract channel 0 as we compile mono
  const result = buffer.getChannelData(0);
  const bufferLength = result.length;
  
  const wavBuffer = new ArrayBuffer(44 + bufferLength * 2);
  const view = new DataView(wavBuffer);
  
  const writeString = (v: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      v.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + bufferLength * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw PCM) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, 1, true); // Mono
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * 2, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, 2, true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, bufferLength * 2, true);
  
  // Write PCM audio samples (Float32 to 16-bit Int PCM)
  let offset = 44;
  for (let i = 0; i < result.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, result[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

/**
 * Fetches and decodes multiple audio files, maps them onto a timeline using
 * OfflineAudioContext, and renders a single consolidated WAV Blob URL.
 */
export async function compileAudioTrack(
  items: AudioTrackItem[],
  totalMs: number
): Promise<string> {
  if (items.length === 0 || totalMs <= 0) {
    throw new Error('[AudioTrackCompiler] No audio items or zero duration provided for compilation.');
  }

  console.log(`[AudioTrackCompiler] Starting master track compilation. Total items: ${items.length} | Total Duration: ${Math.round(totalMs)}ms`);

  const sampleRate = 44100;
  const totalLengthSamples = Math.ceil((totalMs / 1000) * sampleRate);
  
  // Create OfflineAudioContext (Mono, 44100Hz)
  const offlineCtx = new OfflineAudioContext(1, totalLengthSamples, sampleRate);
  
  // Fetch and decode all audio assets in parallel
  const decodePromises = items.map(async (item) => {
    try {
      console.log(`[AudioTrackCompiler] Fetching asset for startMs: ${item.startMs} | url: ${item.url.substring(0, 100)}...`);
      const res = await fetch(item.url);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      
      // Decode audio data using OfflineAudioContext
      const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);
      return { item, audioBuffer };
    } catch (err) {
      console.error(`[AudioTrackCompiler] Failed to fetch or decode audio for startMs: ${item.startMs} | url: ${item.url}`, err);
      return { item, audioBuffer: null };
    }
  });

  const decodedResults = await Promise.all(decodePromises);

  // Schedule each successfully decoded audio buffer in the timeline
  let scheduledCount = 0;
  for (const { item, audioBuffer } of decodedResults) {
    if (!audioBuffer) continue;
    
    const sourceNode = offlineCtx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(offlineCtx.destination);
    
    const startTimeSec = item.startMs / 1000;
    sourceNode.start(startTimeSec);
    scheduledCount++;
  }

  console.log(`[AudioTrackCompiler] Scheduled ${scheduledCount}/${items.length} audio buffers. Starting rendering context...`);

  // Render the audio graph offline
  const renderedBuffer = await offlineCtx.startRendering();
  
  console.log('[AudioTrackCompiler] Rendering completed. Converting buffer to Mono 16-bit PCM WAV Blob...');
  const wavBlob = bufferToWav(renderedBuffer);
  
  const masterBlobUrl = URL.createObjectURL(wavBlob);
  console.log(`[AudioTrackCompiler] Master track compiled successfully. Blob size: ${wavBlob.size} bytes | URL: ${masterBlobUrl}`);
  
  return masterBlobUrl;
}
