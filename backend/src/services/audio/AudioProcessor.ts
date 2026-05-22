import { Env } from '../../types/hono';
import { getAudioService, getElevenLabsService } from './registry';
import { writeAuditLog } from '../../telemetry/audit';

export interface AudioTTSJob {
  type: 'audio_tts';
  sessionId: string;
  stepId: string;
  text: string;
  userId: string;
  workspaceId: string;
  jobId: string;
  language?: string;
  voiceId?: string;
}

export interface AudioSwapJob {
  type: 'audio_swap';
  sessionId: string;
  stepId: string;
  voiceId: string;
  userId: string;
  workspaceId: string;
  jobId: string;
}

export class AudioProcessor {
  constructor(private env: Env) {}

  async process(job: AudioTTSJob) {
    const { sessionId, stepId, text, userId, workspaceId, language, voiceId, jobId } = job;
    const r2Key = `audio/sessions/${sessionId}/steps/${stepId}/tts-v1.wav`;

    console.log(`[AUDIO] TTS start — session:${sessionId} step:${stepId} voiceId:${voiceId} jobId:${jobId}`);

    const audioService = getAudioService(this.env);
    const result = await audioService.generateFromText(text, { language, voiceId });

    await this.env.R2.put(r2Key, result.buffer, {
      httpMetadata: { contentType: result.mimeType },
    });

    const now = Date.now();
    await this.env.DB.prepare(`
      INSERT INTO step_audio (stepId, sessionId, userId, voiceoverKey, syntheticVoiceoverKey, voiceoverSource, voiceoverDurationMs, swapVoiceId, jobId, jobStartedAt, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, 'tts', ?, ?, NULL, NULL, ?, ?)
      ON CONFLICT(stepId, sessionId) DO UPDATE SET
        voiceoverKey          = excluded.voiceoverKey,
        syntheticVoiceoverKey = excluded.syntheticVoiceoverKey,
        voiceoverSource       = 'tts',
        voiceoverDurationMs   = excluded.voiceoverDurationMs,
        swapVoiceId           = excluded.swapVoiceId,
        jobId                 = NULL,
        jobStartedAt          = NULL,
        updatedAt             = excluded.updatedAt
    `).bind(stepId, sessionId, userId, r2Key, r2Key, result.durationMs, voiceId || null, now, now).run();

    await writeAuditLog(this.env, {
      actorId: userId,
      workspaceId,
      action: 'audio.tts_completed',
      targetId: stepId,
      metadata: { sessionId, durationMs: result.durationMs },
    });

    console.log(`[AUDIO] TTS done — key:${r2Key} durationMs:${result.durationMs}`);
  }

  async processSwap(job: AudioSwapJob) {
    const { sessionId, stepId, voiceId, userId, workspaceId, jobId } = job;

    console.log(`[AUDIO] Voice Swap start — session:${sessionId} step:${stepId} voice:${voiceId} jobId:${jobId}`);

    // 1. Fetch current audio record
    const row = await this.env.DB.prepare(
      'SELECT voiceoverKey, originalVoiceoverKey FROM step_audio WHERE stepId = ? AND sessionId = ?'
    ).bind(stepId, sessionId).first<{ voiceoverKey: string | null; originalVoiceoverKey: string | null }>();

    if (!row || !row.voiceoverKey) {
      throw new Error(`Cannot swap voice: no existing audio found for step:${stepId}`);
    }

    // 2. Load the active audio buffer from R2
    const r2Object = await this.env.R2.get(row.voiceoverKey);
    if (!r2Object) {
      throw new Error(`Active voiceover file not found in R2: ${row.voiceoverKey}`);
    }
    const inputBuffer = await r2Object.arrayBuffer();

    // 3. Keep originalVoiceoverKey as fallback
    const originalKey = row.originalVoiceoverKey || row.voiceoverKey;

    // 4. Perform ElevenLabs Voice Swap (Speech-to-Speech)
    const elevenLabs = getElevenLabsService(this.env);
    const result = await elevenLabs.swapVoice(inputBuffer, voiceId);

    // 5. Upload swapped audio
    const swappedKey = `audio/sessions/${sessionId}/steps/${stepId}/swap-${voiceId}.mp3`;
    await this.env.R2.put(swappedKey, result.buffer, {
      httpMetadata: { contentType: result.mimeType },
    });

    // 6. Update step_audio D1 record
    const now = Date.now();
    await this.env.DB.prepare(`
      UPDATE step_audio SET
        voiceoverKey         = ?,
        originalVoiceoverKey = ?,
        voiceoverSource      = 'swap',
        swapVoiceId          = ?,
        voiceoverDurationMs  = ?,
        jobId                = NULL,
        jobStartedAt         = NULL,
        updatedAt            = ?
      WHERE stepId = ? AND sessionId = ?
    `).bind(swappedKey, originalKey, voiceId, result.durationMs, now, stepId, sessionId).run();

    await writeAuditLog(this.env, {
      actorId: userId,
      workspaceId,
      action: 'audio.swap_completed',
      targetId: stepId,
      metadata: { sessionId, voiceId, durationMs: result.durationMs },
    });

    console.log(`[AUDIO] Voice Swap done — key:${swappedKey} durationMs:${result.durationMs}`);
  }
}
