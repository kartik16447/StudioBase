import { Env } from '../../types/hono';
import { getAudioService } from './registry';
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
}

export class AudioProcessor {
  constructor(private env: Env) {}

  async process(job: AudioTTSJob) {
    const { sessionId, stepId, text, userId, workspaceId, language, jobId } = job;
    const r2Key = `audio/sessions/${sessionId}/steps/${stepId}/tts-v1.wav`;

    console.log(`[AUDIO] TTS start — session:${sessionId} step:${stepId} jobId:${jobId}`);

    const audioService = getAudioService(this.env);
    const result = await audioService.generateFromText(text, { language });

    await this.env.R2.put(r2Key, result.buffer, {
      httpMetadata: { contentType: result.mimeType },
    });

    const now = Date.now();
    await this.env.DB.prepare(`
      INSERT INTO step_audio (stepId, sessionId, userId, voiceoverKey, syntheticVoiceoverKey, voiceoverSource, voiceoverDurationMs, jobId, jobStartedAt, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, 'tts', ?, NULL, NULL, ?, ?)
      ON CONFLICT(stepId, sessionId) DO UPDATE SET
        voiceoverKey          = excluded.voiceoverKey,
        syntheticVoiceoverKey = excluded.syntheticVoiceoverKey,
        voiceoverSource       = 'tts',
        voiceoverDurationMs   = excluded.voiceoverDurationMs,
        jobId                 = NULL,
        jobStartedAt          = NULL,
        updatedAt             = excluded.updatedAt
    `).bind(stepId, sessionId, userId, r2Key, r2Key, result.durationMs, now, now).run();

    await writeAuditLog(this.env, {
      actorId: userId,
      workspaceId,
      action: 'audio.tts_completed',
      targetId: stepId,
      metadata: { sessionId, durationMs: result.durationMs },
    });

    console.log(`[AUDIO] TTS done — key:${r2Key} durationMs:${result.durationMs}`);
  }
}
