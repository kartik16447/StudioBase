import { Env } from '../../types/hono';
import type { IAudioService } from './IAudioService';
import { WorkersAIAdapter } from './WorkersAIAdapter';
import { ElevenLabsAdapter } from './ElevenLabsAdapter';

export function getAudioService(env: Env): IAudioService {
  if (env.ELEVENLABS_API_KEY && env.ELEVENLABS_API_KEY !== 'DUMMY_KEY') {
    return new ElevenLabsAdapter(env);
  }
  switch (env.AUDIO_PROVIDER) {
    case 'elevenlabs':
      return new ElevenLabsAdapter(env);
    default:
      return new WorkersAIAdapter(env);
  }
}

export function getElevenLabsService(env: Env): ElevenLabsAdapter {
  return new ElevenLabsAdapter(env);
}
