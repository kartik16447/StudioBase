const fs = require('fs');

const file10 = fs.readFileSync('step-10.mp3');
const bytes = new Uint8Array(file10);

let offset = 0;
let matchCount = 0;

while (offset < bytes.length - 4) {
  if (bytes[offset] === 0xFF && (bytes[offset + 1] & 0xE0) === 0xE0) {
    const header = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    const versionBit = (header >> 19) & 3;
    const layerBit = (header >> 17) & 3;
    const bitrateIndex = (header >> 12) & 15;
    const srIndex = (header >> 10) & 3;
    const paddingBit = (header >> 9) & 1;

    console.log(`Match ${matchCount++} at offset ${offset}: 0x${header.toString(16).toUpperCase()} -> versionBit=${versionBit}, layerBit=${layerBit}, bitrateIndex=${bitrateIndex}, srIndex=${srIndex}`);
    
    // Compute frame size if valid
    if (versionBit !== 1 && layerBit !== 0 && bitrateIndex !== 15 && srIndex !== 3) {
      const version = versionBit === 3 ? 1 : (versionBit === 2 ? 2 : 2.5);
      const layer = 4 - layerBit;
      
      const bitratesMPEG2 = [
        [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
        [0,  8, 16, 24, 32, 40, 48,  56,  64,  80,  96, 112, 128, 144, 160],
        [0,  8, 16, 24, 32, 40, 48,  56,  64,  80,  96, 112, 128, 144, 160],
      ];
      const sampleRates = [
        [44100, 48000, 32000],
        [22050, 24000, 16000],
        [11025, 12000,  8000],
      ];

      const bitrate = version === 1 ? 0 : bitratesMPEG2[layer - 1][bitrateIndex]; // simplification for test
      const sampleRate = version === 1 ? 0 : sampleRates[version === 2 ? 1 : 2][srIndex];
      const frameSize = Math.floor(144 * (bitrate * 1000) / sampleRate) + paddingBit;
      
      console.log(`   VALID frame! size=${frameSize}`);
      offset += frameSize;
    } else {
      console.log(`   INVALID header!`);
      offset++;
    }
  } else {
    offset++;
  }
}
