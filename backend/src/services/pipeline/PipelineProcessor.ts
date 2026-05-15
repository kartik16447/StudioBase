import { Env } from '../../types/hono';
import { AuditService } from '../AuditService';
import { Events } from '../../telemetry/events';

export interface PipelineJob {
  sessionId: string;
  userId: string;
  r2JsonKey?: string;
  requestedOutputs?: {
    sop?: boolean;
    demo?: boolean;
    video?: boolean;
  };
}

export class PipelineProcessor {
  private audit: AuditService;

  constructor(private env: Env) {
    this.audit = new AuditService(env);
  }

  async process(job: PipelineJob) {
    const { sessionId, userId } = job;
    const now = Date.now();

    try {
      await this.audit.record({
        eventName: 'pipeline.started',
        userId,
        sessionId,
        properties: { ...job.requestedOutputs }
      });

      console.log(`[PIPELINE] Starting: ${sessionId}`);

      // Placeholder for AI / Export logic (Phase 3)
      // This will be expanded with actual frame extraction, TTS, etc.
      
      await this.env.DB.prepare(
        'UPDATE sessions SET status = ?, pipelinePath = ?, updatedAt = ? WHERE id = ?'
      ).bind('ready', 'cloud', now, sessionId).run();

      await this.audit.record({
        eventName: 'pipeline.completed',
        userId,
        sessionId,
        properties: { durationMs: Date.now() - now }
      });

      console.log(`[PIPELINE] Done: ${sessionId}`);
    } catch (err: any) {
      console.error(`[PIPELINE] Failed for ${sessionId}:`, err.message);
      
      await this.env.DB.prepare(
        'UPDATE sessions SET status = ?, updatedAt = ? WHERE id = ?'
      ).bind('failed', Date.now(), sessionId).run();

      await this.audit.record({
        eventName: 'pipeline.failed',
        userId,
        sessionId,
        properties: { error: err.message }
      });

      throw err; // Allow queue retry
    }
  }
}
