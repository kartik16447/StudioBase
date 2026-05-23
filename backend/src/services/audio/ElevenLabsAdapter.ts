import { Env } from '../../types/hono';
import { IAudioService, AudioResult } from './IAudioService';

export class ElevenLabsAdapter implements IAudioService {
  constructor(private env: Env) {}

  async generateFromText(text: string, options?: { voiceId?: string; language?: string }): Promise<AudioResult> {
    const apiKey = this.env.ELEVENLABS_API_KEY;

    // Default to Rachel if no voiceId is provided
    const voiceId = options?.voiceId || '21m00Tcm4TlvDq8ikWAM';

    if (!apiKey || apiKey === '' || apiKey === 'DUMMY_KEY') {
      console.log(`[ElevenLabsAdapter] No API key for TTS — using Deepgram Aura-1 with voice mapping for voiceId: ${voiceId}`);

      // Map ElevenLabs voiceId to a Deepgram Aura speaker (same mapping as swapVoice)
      const auraSpeakers = ['angus', 'asteria', 'arcas', 'orion', 'orpheus', 'athena', 'luna', 'zeus', 'perseus', 'helios', 'hera', 'stella'];
      let speaker = 'asteria'; // default (Rachel)
      if (auraSpeakers.includes(voiceId.toLowerCase())) {
        speaker = voiceId.toLowerCase();
      } else if (voiceId === '21m00Tcm4TlvDq8ikWAM') speaker = 'asteria';
      else if (voiceId === '29vD33N1CtxCmqQRPOHJ') speaker = 'angus';
      else if (voiceId === '2EiwWnXF2V4jofwvRnss') speaker = 'zeus';
      else if (voiceId === 'piTKgcLEGmPEe24yT1vF') speaker = 'luna';
      else if (voiceId === 'AZnzlk1Xgd1AawpnG3qV') speaker = 'arcas';

      try {
        console.log(`[ElevenLabsAdapter] Calling Deepgram Aura-1 (${speaker}) for TTS...`);
        const ttsResponse = await (this.env.AI.run as any)(
          '@cf/deepgram/aura-1',
          { text, speaker, encoding: 'mp3' },
          { returnRawResponse: true }
        ) as Response;

        if (!ttsResponse.ok) throw new Error(`Deepgram Aura-1 failed: ${ttsResponse.status}`);

        const outputBuffer = await ttsResponse.arrayBuffer();
        return { buffer: outputBuffer, mimeType: 'audio/mpeg', durationMs: estimateAudioDuration(outputBuffer, 'audio/mpeg') };
      } catch (deepgramErr: any) {
        console.warn('[ElevenLabsAdapter] Deepgram TTS failed, falling back to MeloTTS:', deepgramErr.message);
        const fallback = new (await import('./WorkersAIAdapter')).WorkersAIAdapter(this.env);
        return fallback.generateFromText(text, options);
      }
    }

    console.log(`[ElevenLabsAdapter] Calling ElevenLabs Text-to-Speech API for voice: ${voiceId}`);
    
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ElevenLabs TTS API failed: ${response.status} - ${errText}`);
    }

    const outputBuffer = await response.arrayBuffer();
    const durationMs = estimateAudioDuration(outputBuffer, 'audio/mpeg');

    return {
      buffer: outputBuffer,
      mimeType: 'audio/mpeg',
      durationMs,
    };
  }

  async swapVoice(audioBuffer: ArrayBuffer, voiceId: string): Promise<AudioResult> {
    const apiKey = this.env.ELEVENLABS_API_KEY;

    if (!apiKey || apiKey === '' || apiKey === 'DUMMY_KEY') {
      console.log(`[ElevenLabsAdapter] No ElevenLabs API key found. Falling back to Cloudflare Workers AI Speech-to-Speech pipeline for voice: ${voiceId}`);
      
      let speaker = 'asteria'; // default
      const voiceLower = voiceId.toLowerCase();
      const auraSpeakers = ['angus', 'asteria', 'arcas', 'orion', 'orpheus', 'athena', 'luna', 'zeus', 'perseus', 'helios', 'hera', 'stella'];
      
      if (auraSpeakers.includes(voiceLower)) {
        speaker = voiceLower;
      } else {
        // Map ElevenLabs voiceId to Cloudflare Aura speaker
        if (voiceId === '21m00Tcm4TlvDq8ikWAM') speaker = 'asteria';      // Rachel -> Asteria
        else if (voiceId === '29vD33N1CtxCmqQRPOHJ') speaker = 'angus';   // Drew -> Angus
        else if (voiceId === '2EiwWnXF2V4jofwvRnss') speaker = 'zeus';    // Clyde -> Zeus
        else if (voiceId === 'piTKgcLEGmPEe24yT1vF') speaker = 'luna';    // Nicole -> Luna
        else if (voiceId === 'AZnzlk1Xgd1AawpnG3qV') speaker = 'arcas';   // Dom -> Arcas
      }

      console.log(`[ElevenLabsAdapter] Step 1: Transcribing input audio buffer using Whisper...`);
      const base64Audio = Buffer.from(audioBuffer).toString('base64');
      const transcription = await (this.env.AI.run as any)('@cf/openai/whisper-large-v3-turbo', {
        audio: base64Audio,
      }) as { text: string };

      const text = transcription?.text;
      if (!text || text.trim().length === 0) {
        throw new Error('Cloudflare Workers AI Speech-to-Speech: No speech detected in input audio');
      }
      console.log('[ElevenLabsAdapter] Transcription successful:', text);

      console.log(`[ElevenLabsAdapter] Step 2: Synthesizing voice with Deepgram Aura-1 (${speaker})...`);
      try {
        const ttsResponse = await (this.env.AI.run as any)(
          '@cf/deepgram/aura-1',
          { 
            text, 
            speaker,
            encoding: 'mp3'
          },
          { returnRawResponse: true }
        ) as Response;

        if (!ttsResponse.ok) {
          throw new Error(`Workers AI Deepgram Aura-1 failed: ${ttsResponse.status}`);
        }

        const outputBuffer = await ttsResponse.arrayBuffer();
        const durationMs = estimateAudioDuration(outputBuffer, 'audio/mpeg');

        return {
          buffer: outputBuffer,
          mimeType: 'audio/mpeg',
          durationMs,
        };
      } catch (ttsErr: any) {
        console.warn('[ElevenLabsAdapter] Deepgram Aura-1 failed, falling back to MeloTTS:', ttsErr.message);
        
        // Fallback to MeloTTS
        const melottsResponse = await (this.env.AI.run as any)('@cf/myshell-ai/melotts', {
          prompt: text,
          lang: 'en',
        }) as Uint8Array | { audio: string } | { audio: number[] };

        let outputBytes: Uint8Array;
        if (melottsResponse instanceof Uint8Array) {
          outputBytes = melottsResponse;
        } else if (Array.isArray((melottsResponse as any).audio)) {
          outputBytes = new Uint8Array((melottsResponse as { audio: number[] }).audio);
        } else {
          outputBytes = Uint8Array.from(atob((melottsResponse as { audio: string }).audio), c => c.charCodeAt(0));
        }

        const durationMs = estimateAudioDuration(outputBytes.buffer as ArrayBuffer, 'audio/wav');

        return {
          buffer: outputBytes.buffer as ArrayBuffer,
          mimeType: 'audio/wav',
          durationMs,
        };
      }
    }

    console.log(`[ElevenLabsAdapter] Calling ElevenLabs Speech-to-Speech API for voice: ${voiceId}`);
    
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
    formData.append('audio', audioBlob, 'input.wav');
    formData.append('model_id', 'eleven_english_sts_v2');

    const response = await fetch(`https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ElevenLabs STS API failed: ${response.status} - ${errText}`);
    }

    const outputBuffer = await response.arrayBuffer();
    const durationMs = estimateAudioDuration(outputBuffer, 'audio/mpeg');

    return {
      buffer: outputBuffer,
      mimeType: 'audio/mpeg', // ElevenLabs defaults to mp3 (mpeg)
      durationMs,
    };
  }
}

export function estimateMp3Duration(buffer: ArrayBuffer): number {
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
        // Invalid header, skip 1 byte
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

      // Sync-tolerant jump: skip almost entire frame but leave 10 bytes safety margin
      offset += Math.max(1, frameSize - 10);
    } else {
      offset++;
    }
  }

  return Math.round(totalDurationMs);
}

export function estimateAudioDuration(buffer: ArrayBuffer, mimeType?: string): number {
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
  // If it's Deepgram (smaller file / lower bitrate typical), default to 48 kbps => 6000 bytes/s
  // If it's ElevenLabs, default to 128 kbps => 16000 bytes/s
  const assumedByteRate = buffer.byteLength < 100000 ? 6000 : 16000;
  return Math.round((buffer.byteLength / assumedByteRate) * 1000);
}
