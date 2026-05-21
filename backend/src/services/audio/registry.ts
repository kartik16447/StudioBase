import { Env } from '../../types/hono';
import type { IAudioService } from './IAudioService';
import { WorkersAIAdapter } from './WorkersAIAdapter';
import { ElevenLabsAdapter } from './ElevenLabsAdapter';

export function getAudioService(env: Env): IAudioService {
  switch (env.AUDIO_PROVIDER) {
    default:
      return new WorkersAIAdapter(env);
  }
}

export function getElevenLabsService(env: Env): ElevenLabsAdapter {
  return new ElevenLabsAdapter(env);
}
