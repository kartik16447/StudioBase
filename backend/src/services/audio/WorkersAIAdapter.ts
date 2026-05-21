import { Env } from '../../types/hono';
import type { IAudioService, AudioResult } from './IAudioService';

export class WorkersAIAdapter implements IAudioService {
  constructor(private env: Env) {}

  async generateFromText(text: string, options?: { voiceId?: string; language?: string }): Promise<AudioResult> {
    // AiTextToSpeechOutput = Uint8Array | { audio: string }
    // MeloTTS returns raw WAV bytes (Uint8Array) in most runtimes; some older
    // bindings wrap it as a base64 string in { audio }.  Handle both.
    const response = await (this.env.AI.run as any)('@cf/myshell-ai/melotts', {
      prompt: text,
      lang: options?.language ?? 'en',
    }) as Uint8Array | { audio: string } | { audio: number[] };

    let audioBytes: Uint8Array;

    if (response instanceof Uint8Array) {
      audioBytes = response;
    } else if (Array.isArray((response as any).audio)) {
      // Some bindings return { audio: number[] }
      audioBytes = new Uint8Array((response as { audio: number[] }).audio);
    } else {
      // Base64-encoded string
      audioBytes = Uint8Array.from(atob((response as { audio: string }).audio), c => c.charCodeAt(0));
    }

    // MeloTTS outputs WAV; estimate duration from PCM at 22050 Hz mono 16-bit.
    // Caller patches the accurate value back via PATCH /audio-duration after browser decode.
    const durationMs = Math.round((audioBytes.byteLength / (22050 * 2)) * 1000);

    return {
      buffer: audioBytes.buffer as ArrayBuffer,
      mimeType: 'audio/wav',
      durationMs,
    };
  }
}
