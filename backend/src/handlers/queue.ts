import { Env } from '../types/hono';
import { PipelineProcessor } from '../pipeline/processor';

export async function handleQueue(batch: MessageBatch, env: Env, ctx: ExecutionContext) {
  const processor = new PipelineProcessor(env);
  
  for (const message of batch.messages) {
    try {
      console.log(`[QUEUE] Processing message ${message.id} for session ${ (message.body as any).sessionId }`);
      await processor.process(message.body as any);
      message.ack();
    } catch (err: any) {
      console.error(`[QUEUE] Failed to process message ${message.id}:`, err.message);
      // Exponential backoff or max retries should be handled by Wrangler/Cloudflare Queue config, 
      // but we explicitly retry here if it's a transient failure.
      message.retry();
    }
  }
}
