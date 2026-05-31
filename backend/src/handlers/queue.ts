import { Env } from '../types/hono';
import { PipelineProcessor } from '../services/pipeline/PipelineProcessor';
import { AudioProcessor } from '../services/audio/AudioProcessor';
import { creditRefundStatements, CreditActionType } from '../services/CreditService';

export async function handleQueue(batch: MessageBatch, env: Env, ctx: ExecutionContext) {
  const pipelineProcessor = new PipelineProcessor(env);
  const audioProcessor = new AudioProcessor(env);

  const promises = batch.messages.map(async (message) => {
    const body: any = message.body;
    const jobType: string = body.type ?? 'pipeline';

    try {
      console.log(`[QUEUE] Processing message:${message.id} type:${jobType} session:${body.sessionId}`);

      if (jobType === 'audio_tts') {
        await audioProcessor.process(body);
      } else if (jobType === 'audio_swap') {
        await audioProcessor.processSwap(body);
      } else {
        await pipelineProcessor.process(body);
      }

      message.ack();
    } catch (err: any) {
      console.error(`[QUEUE] Failed message:${message.id} type:${jobType}:`, err.message);

      if (message.attempts > 3) {
        console.error(`[QUEUE] Message:${message.id} exhausted retries — terminal failure.`);

        if (jobType === 'audio_tts' || jobType === 'audio_swap') {
          // Refund credit + reset step state so UI doesn't stay stuck
          const now = Date.now();
          const actionType: CreditActionType = jobType === 'audio_tts' ? 'audio_tts' : 'audio_swap';
          await env.DB.batch([
            ...creditRefundStatements(env.DB, body.workspaceId, body.userId, body.sessionId, actionType, 1, now),
            jobType === 'audio_tts'
              ? env.DB.prepare(
                  'UPDATE step_audio SET voiceoverSource = NULL, jobId = NULL, jobStartedAt = NULL, updatedAt = ? WHERE stepId = ? AND sessionId = ?'
                ).bind(now, body.stepId, body.sessionId)
              : env.DB.prepare(
                  `UPDATE step_audio SET
                    voiceoverKey = COALESCE(originalVoiceoverKey, voiceoverKey),
                    voiceoverSource = CASE
                      WHEN originalVoiceoverKey IS NOT NULL THEN (CASE WHEN originalVoiceoverKey LIKE '%tts%' THEN 'tts' ELSE 'original' END)
                      ELSE 'original'
                    END,
                    originalVoiceoverKey = NULL,
                    swapVoiceId = NULL,
                    jobId = NULL,
                    jobStartedAt = NULL,
                    updatedAt = ?
                  WHERE stepId = ? AND sessionId = ?`
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
  });

  await Promise.allSettled(promises);
}
