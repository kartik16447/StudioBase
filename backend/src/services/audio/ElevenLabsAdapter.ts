import { Env } from '../../types/hono';
import { IAudioService, AudioResult } from './IAudioService';

export class ElevenLabsAdapter implements IAudioService {
  constructor(private env: Env) {}

  async generateFromText(text: string, options?: { voiceId?: string; language?: string }): Promise<AudioResult> {
    const apiKey = this.env.ELEVENLABS_API_KEY;
    if (!apiKey || apiKey === '' || apiKey === 'DUMMY_KEY') {
       console.log('[ElevenLabsAdapter] No API key for TTS, falling back to WorkersAIAdapter');
       const fallback = new (require('./WorkersAIAdapter').WorkersAIAdapter)(this.env);
       return fallback.generateFromText(text, options);
    }
    
    // Default to Rachel if no voiceId is provided
    const voiceId = options?.voiceId || '21m00Tcm4TlvDq8ikWAM';
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
    const durationMs = Math.round((outputBuffer.byteLength / (44100 * 2)) * 1000); 

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
            encoding: 'mp3',
            container: 'none'
          },
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
