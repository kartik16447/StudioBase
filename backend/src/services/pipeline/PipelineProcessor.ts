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

      // 1. Update session status to processing
      await this.env.DB.prepare(
        'UPDATE sessions SET status = ?, updatedAt = ? WHERE id = ?'
      ).bind('processing', now, sessionId).run();

      // 2. Parse payload and simulate backend generation work
      if (job.r2JsonKey) {
        const obj = await this.env.R2.get(job.r2JsonKey);
        if (obj) {
          const envelope: any = await obj.json();
          // Simulate work (e.g., adding metadata)
          envelope.metadata = envelope.metadata || {};
          envelope.metadata.processedAt = Date.now();
          envelope.metadata.outputs = job.requestedOutputs;
          
          // 3. Re-save the SessionEnvelope JSON to R2
          await this.env.R2.put(job.r2JsonKey, JSON.stringify(envelope), {
            httpMetadata: { contentType: 'application/json' }
          });
        }
      }
      
      // 4. On success, update session status to ready
      await this.env.DB.prepare(
        'UPDATE sessions SET status = ?, pipelinePath = ?, updatedAt = ? WHERE id = ?'
      ).bind('ready', 'cloud', Date.now(), sessionId).run();

      await this.audit.record({
        eventName: 'pipeline.completed',
        userId,
        sessionId,
        properties: { durationMs: Date.now() - now }
      });

      console.log(`[PIPELINE] Done: ${sessionId}`);
    } catch (err: any) {
      console.error(`[PIPELINE] Failed for ${sessionId}:`, err.message);
      
      // 5. On error, catch the exception, update status to failed, and populate errorReason
      await this.env.DB.prepare(
        'UPDATE sessions SET status = ?, errorReason = ?, updatedAt = ? WHERE id = ?'
      ).bind('failed', err.message, Date.now(), sessionId).run();

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
