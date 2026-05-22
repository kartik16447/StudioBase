const fs = require('fs');

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
    // Look for frame sync (11 bits set to 1)
    if (bytes[offset] === 0xFF && (bytes[offset + 1] & 0xE0) === 0xE0) {
      const header = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
      
      const versionBit = (header >> 19) & 3; // 2 bits: 00=MPEG-2.5, 01=reserved, 10=MPEG-2, 11=MPEG-1
      const layerBit = (header >> 17) & 3;   // 2 bits: 00=reserved, 01=Layer III, 10=Layer II, 11=Layer I
      const bitrateIndex = (header >> 12) & 15;
      const srIndex = (header >> 10) & 3;
      const paddingBit = (header >> 9) & 1;

      if (versionBit === 1 || layerBit === 0 || bitrateIndex === 0 || bitrateIndex === 15 || srIndex === 3) {
        // Invalid header sync, skip 1 byte and scan next
        offset++;
        continue;
      }

      const version = versionBit === 3 ? 1 : (versionBit === 2 ? 2 : 2.5);
      const layer = 4 - layerBit;

      // Determine bitrate (in kbps)
      let bitrate = 0;
      if (version === 1) {
        bitrate = bitratesMPEG1[layer - 1][bitrateIndex];
      } else {
        bitrate = bitratesMPEG2[layer - 1][bitrateIndex];
      }

      // Determine sample rate (in Hz)
      const srVerIdx = version === 1 ? 0 : (version === 2 ? 1 : 2);
      const sampleRate = sampleRates[srVerIdx][srIndex];

      if (bitrate === 0 || sampleRate === 0) {
        offset++;
        continue;
      }

      // Frame size calculation
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

      // Calculate duration of this frame in milliseconds
      const frameDurationMs = (samplesPerFrame / sampleRate) * 1000;
      totalDurationMs += frameDurationMs;
      framesCount++;

      // Sync-tolerant jump
      offset += Math.max(1, frameSize - 10);
    } else {
      offset++;
    }
  }

  console.log(`Parsed ${framesCount} MP3 frames.`);
  return Math.round(totalDurationMs);
}

function estimateAudioDuration(buffer) {
  const bytes = new Uint8Array(buffer);
  
  // Check magic bytes for WAV ("RIFF")
  if (bytes.length >= 44 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) { // "RIFF"
    const byteRate = bytes[28] | (bytes[29] << 8) | (bytes[30] << 16) | (bytes[31] << 24);
    if (byteRate > 0) {
      const dataLength = bytes.length - 44;
      return Math.round((dataLength / byteRate) * 1000);
    }
    // Fallback PCM WAV estimate (22050 Hz 16-bit mono = 44100 bytes/s)
    return Math.round((buffer.byteLength / 44100) * 1000);
  }

  // Otherwise, assume MP3
  const mp3Duration = estimateMp3Duration(buffer);
  if (mp3Duration > 0) {
    return mp3Duration;
  }

  // Fallback to standard MP3 estimate:
  const assumedByteRate = buffer.byteLength < 100000 ? 6000 : 16000;
  return Math.round((buffer.byteLength / assumedByteRate) * 1000);
}

const file10 = fs.readFileSync('step-10.mp3');
const file11 = fs.readFileSync('step-11.mp3');

const buf10 = file10.buffer.slice(file10.byteOffset, file10.byteOffset + file10.byteLength);
const buf11 = file11.buffer.slice(file11.byteOffset, file11.byteOffset + file11.byteLength);

console.log(`step-10.mp3 file size: ${file10.byteLength} bytes`);
console.log(`step-10.mp3 estimated duration: ${estimateAudioDuration(buf10)} ms`);

console.log('\n---');
console.log(`step-11.mp3 file size: ${file11.byteLength} bytes`);
console.log(`step-11.mp3 estimated duration: ${estimateAudioDuration(buf11)} ms`);
