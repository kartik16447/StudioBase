import { Env } from '../../types/hono';
import { IAudioService, AudioResult } from './IAudioService';

export class ElevenLabsAdapter implements IAudioService {
  constructor(private env: Env) {}

  async generateFromText(text: string): Promise<AudioResult> {
    throw new Error('ElevenLabsAdapter does not support text-to-speech in our design; use WorkersAIAdapter.');
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
      const audioBytes = new Uint8Array(audioBuffer);
      const transcription = await (this.env.AI.run as any)('@cf/openai/whisper-large-v3-turbo', {
        audio: Array.from(audioBytes),
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
          { text, speaker },
          { returnRawResponse: true }
        ) as Response;

        if (!ttsResponse.ok) {
          throw new Error(`Workers AI Deepgram Aura-1 failed: ${ttsResponse.status}`);
        }

        const outputBuffer = await ttsResponse.arrayBuffer();
        // Estimate duration at 44100 Hz mono 16-bit
        const durationMs = Math.round((outputBuffer.byteLength / (44100 * 2)) * 1000);

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

        const durationMs = Math.round((outputBytes.byteLength / (22050 * 2)) * 1000);

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
    // Default duration estimate - updated by client after decode
    const durationMs = Math.round((outputBuffer.byteLength / (44100 * 2)) * 1000); 

    return {
      buffer: outputBuffer,
      mimeType: 'audio/mpeg', // ElevenLabs defaults to mp3 (mpeg)
      durationMs,
    };
  }
}
