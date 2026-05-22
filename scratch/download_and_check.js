const fs = require('fs');
const path = require('path');

const sessionId = 'd384eddb-c5a3-469f-aac8-9cab98ca7740';
const stepsToCheck = ['step-10', 'step-11', 'step-12'];
const voiceId = '2EiwWnXF2V4jofwvRnss';

function estimateMp3Duration(buffer) {
  const bytes = new Uint8Array(buffer);
  let totalDurationMs = 0;
  let offset = 0;

  const bitratesMPEG1 = [
    [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448], // Layer I
    [0, 32, 48, 56,  64,  80,  96, 112, 128, 160, 192, 224, 256, 320, 384], // Layer II
    [0, 32, 40, 48,  56,  64,  80,  96, 112, 128, 160, 192, 224, 256, 320], // Layer III
  ];
  const bitratesMPEG2 = [
    [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256], // Layer I
    [0,  8, 16, 24, 32, 40, 48,  56,  64,  80,  96, 112, 128, 144, 160], // Layer II/III
    [0,  8, 16, 24, 32, 40, 48,  56,  64,  80,  96, 112, 128, 144, 160], // Layer III
  ];

  const sampleRates = [
    [44100, 48000, 32000], // MPEG-1
    [22050, 24000, 16000], // MPEG-2
    [11025, 12000,  8000], // MPEG-2.5
  ];

  // Skip ID3v2 tag if present
  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const tagSize = ((bytes[6] & 0x7F) << 21) |
                    ((bytes[7] & 0x7F) << 14) |
                    ((bytes[8] & 0x7F) << 7) |
                    (bytes[9] & 0x7F);
    offset = 10 + tagSize;
  }

  let framesCount = 0;
  while (offset < bytes.length - 4) {
    if (bytes[offset] === 0xFF && (bytes[offset + 1] & 0xE0) === 0xE0) {
      const header = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
      
      const versionBit = (header >> 19) & 3;
      const layerBit = (header >> 17) & 3;
      const bitrateIndex = (header >> 12) & 15;
      const srIndex = (header >> 10) & 3;
      const paddingBit = (header >> 9) & 1;

      if (versionBit === 1 || layerBit === 0 || bitrateIndex === 0 || bitrateIndex === 15 || srIndex === 3) {
        offset++;
        continue;
      }

      const version = versionBit === 3 ? 1 : (versionBit === 2 ? 2 : 2.5);
      const layer = 4 - layerBit;

      let bitrate = 0;
      if (version === 1) {
        bitrate = bitratesMPEG1[layer - 1][bitrateIndex];
      } else {
        bitrate = bitratesMPEG2[layer - 1][bitrateIndex];
      }

      const srVerIdx = version === 1 ? 0 : (version === 2 ? 1 : 2);
      const sampleRate = sampleRates[srVerIdx][srIndex];

      if (bitrate === 0 || sampleRate === 0) {
        offset++;
        continue;
      }

      let frameSize = 0;
      let samplesPerFrame = 0;
      if (layer === 1) {
        samplesPerFrame = 384;
        frameSize = Math.floor((12 * (bitrate * 1000) / sampleRate) + paddingBit) * 4;
      } else if (layer === 2) {
        samplesPerFrame = 1152;
        frameSize = Math.floor(144 * (bitrate * 1000) / sampleRate) + paddingBit;
      } else { // Layer III
        samplesPerFrame = (version === 1) ? 1152 : 576;
        const coef = (version === 1) ? 144 : 72;
        frameSize = Math.floor(coef * (bitrate * 1000) / sampleRate) + paddingBit;
      }

      if (frameSize <= 0) {
        offset++;
        continue;
      }

      const frameDurationMs = (samplesPerFrame / sampleRate) * 1000;
      totalDurationMs += frameDurationMs;
      framesCount++;

      offset += Math.max(1, frameSize - 10);
    } else {
      offset++;
    }
  }

  return Math.round(totalDurationMs);
}

async function run() {
  for (const stepId of stepsToCheck) {
    const audioKey = `audio/sessions/${sessionId}/steps/${stepId}/swap-${voiceId}.mp3`;
    const url = `https://studiobase-backend.karthik-upadhyay98.workers.dev/v1/public/${sessionId}/asset/${encodeURIComponent(audioKey)}`;
    
    console.log(`Downloading ${stepId} audio from: ${url}...`);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`  Error: HTTP ${res.status}`);
        continue;
      }
      
      const buffer = await res.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      console.log(`  Downloaded ${buffer.byteLength} bytes.`);
      
      // Check magic bytes
      const isWav = bytes.length >= 4 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46; // RIFF
      if (isWav) {
        console.log(`  Format: WAV (Fallback / MeloTTS)`);
      } else {
        const estDuration = estimateMp3Duration(buffer);
        console.log(`  Format: MP3. Estimated duration: ${estDuration} ms`);
      }
    } catch (e) {
      console.error(`  Fetch failed for ${stepId}:`, e.message);
    }
  }
}

run();
