import { Env } from '../../types/hono';
import type { IAudioService, AudioResult } from './IAudioService';

export class WorkersAIAdapter implements IAudioService {
  constructor(private env: Env) {}

  async generateFromText(text: string, options?: { voiceId?: string; language?: string }): Promise<AudioResult> {
    const response = await (this.env.AI.run as any)('@cf/myshell-ai/melotts', {
      prompt: text,
      lang: options?.language ?? 'en',
    }) as { audio: string };

    const audioBytes = Uint8Array.from(atob(response.audio), c => c.charCodeAt(0));

    // Estimate duration from MP3 file size at ~128kbps CBR.
    // Caller patches the accurate value back via PATCH /audio-duration after browser decode.
    const durationMs = Math.round((audioBytes.byteLength * 8) / 128_000 * 1000);

    return {
      buffer: audioBytes.buffer as ArrayBuffer,
      mimeType: 'audio/mpeg',
      durationMs,
    };
  }
}
