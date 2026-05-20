import { Env } from '../../types/hono';
import type { IAudioService } from './IAudioService';
import { WorkersAIAdapter } from './WorkersAIAdapter';

export function getAudioService(env: Env): IAudioService {
  switch (env.AUDIO_PROVIDER) {
    // 'elevenlabs': reserved for Phase G — ElevenLabsAdapter not yet implemented
    default:
      return new WorkersAIAdapter(env);
  }
}
