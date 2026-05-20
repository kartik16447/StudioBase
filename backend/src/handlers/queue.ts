import { Env } from '../types/hono';
import { PipelineProcessor } from '../services/pipeline/PipelineProcessor';
import { AudioProcessor } from '../services/audio/AudioProcessor';

export async function handleQueue(batch: MessageBatch, env: Env, ctx: ExecutionContext) {
  const pipelineProcessor = new PipelineProcessor(env);
  const audioProcessor = new AudioProcessor(env);

  for (const message of batch.messages) {
    const body: any = message.body;
    const jobType: string = body.type ?? 'pipeline';

    try {
      console.log(`[QUEUE] Processing message:${message.id} type:${jobType} session:${body.sessionId}`);

      if (jobType === 'audio_tts') {
        await audioProcessor.process(body);
      } else {
        await pipelineProcessor.process(body);
      }

      message.ack();
    } catch (err: any) {
      console.error(`[QUEUE] Failed message:${message.id} type:${jobType}:`, err.message);

      if (message.attempts > 3) {
        console.error(`[QUEUE] Message:${message.id} exhausted retries — terminal failure.`);

        if (jobType === 'audio_tts') {
          // Refund credit + reset step state so UI doesn't stay stuck
          const now = Date.now();
          await env.DB.batch([
            env.DB.prepare('UPDATE users SET creditsBalance = creditsBalance + 1 WHERE id = ?')
              .bind(body.userId),
            env.DB.prepare(
              'INSERT INTO credits_ledger (id, userId, delta, reason, sessionId, createdAt) VALUES (?, ?, 1, ?, ?, ?)'
            ).bind(crypto.randomUUID(), body.userId, 'audio_tts_refund', body.sessionId, now),
            env.DB.prepare(
              'UPDATE step_audio SET voiceoverSource = NULL, jobId = NULL, jobStartedAt = NULL, updatedAt = ? WHERE stepId = ? AND sessionId = ?'
            ).bind(now, body.stepId, body.sessionId),
          ]);
        } else {
          await env.DB.prepare(
            'UPDATE sessions SET status = ?, errorReason = ?, updatedAt = ? WHERE id = ?'
          ).bind('failed', 'Max retries exceeded', Date.now(), body.sessionId).run();

          const { writeAuditLog } = await import('../telemetry/audit');
          await writeAuditLog(env, {
            actorId: body.userId,
            action: 'pipeline.terminal_failure',
            workspaceId: body.workspaceId || 'unknown',
            targetId: body.sessionId,
            metadata: { error: 'Max retries exceeded', messageId: message.id },
          });
        }

        message.ack();
      } else {
        message.retry();
      }
    }
  }
}
