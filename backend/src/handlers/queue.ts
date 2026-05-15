import { Env } from '../types/hono';
import { PipelineProcessor } from '../services/pipeline/PipelineProcessor';

export async function handleQueue(batch: MessageBatch, env: Env, ctx: ExecutionContext) {
  const processor = new PipelineProcessor(env);
  
  for (const message of batch.messages) {
    try {
      console.log(`[QUEUE] Processing message ${message.id} for session ${ (message.body as any).sessionId }`);
      await processor.process(message.body as any);
      message.ack();
    } catch (err: any) {
      console.error(`[QUEUE] Failed to process message ${message.id}:`, err.message);
      
      if (message.attempts > 3) {
        console.error(`[QUEUE] Message ${message.id} exhausted max retries. Moving to terminal failure.`);
        const body: any = message.body;
        
        await env.DB.prepare(
          'UPDATE sessions SET status = ?, errorReason = ?, updatedAt = ? WHERE id = ?'
        ).bind('failed', 'Max retries exceeded', Date.now(), body.sessionId).run();

        // Use context-free audit logging if needed, or instantiate AuditService
        const { writeAuditLog } = await import('../telemetry/audit');
        await writeAuditLog(env, {
          actorId: body.userId,
          action: 'pipeline.terminal_failure',
          workspaceId: body.workspaceId || 'unknown',
          targetId: body.sessionId,
          metadata: { error: 'Max retries exceeded', messageId: message.id }
        });
        
        message.ack(); // Remove from queue
      } else {
        message.retry();
      }
    }
  }
}
