import { Env } from '../types/hono';
import { AuditService } from './AuditService';
import { PipelineJob } from './pipeline/PipelineProcessor';

export class PipelineService {
  private audit: AuditService;

  constructor(private env: Env, private executionCtx?: any) {
    this.audit = new AuditService(env, executionCtx);
  }

  async trigger(userId: string, sessionId: string, requestedOutputs: any) {
    const session = await this.env.DB.prepare(
      'SELECT * FROM sessions WHERE id = ? AND ownerId = ?'
    ).bind(sessionId, userId).first() as any;
    
    if (!session) throw new Error('NOT_FOUND');

    const creditCost =
      (requestedOutputs?.sop ? 1 : 0) +
      (requestedOutputs?.demo ? 1 : 0) +
      (requestedOutputs?.video ? 2 : 0);

    if (creditCost === 0) throw new Error('NO_OUTPUTS');

    const userRecord = await this.env.DB.prepare('SELECT creditsBalance FROM users WHERE id = ?').bind(userId).first() as any;
    if ((userRecord?.creditsBalance || 0) < creditCost) {
      await this.env.DB.prepare('UPDATE sessions SET status = ? WHERE id = ?').bind('credit_exhausted', sessionId).run();
      throw new Error(`INSUFFICIENT_CREDITS:${creditCost}:${userRecord?.creditsBalance || 0}`);
    }

    const now = Date.now();
    await this.env.DB.batch([
      this.env.DB.prepare('UPDATE users SET creditsBalance = creditsBalance - ? WHERE id = ?').bind(creditCost, userId),
      this.env.DB.prepare('INSERT INTO credits_ledger (id, userId, delta, reason, sessionId, createdAt) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), userId, -creditCost, 'generation', sessionId, now),
      this.env.DB.prepare('UPDATE sessions SET status = ?, updatedAt = ? WHERE id = ?').bind('processing', now, sessionId),
    ]);

    const job: PipelineJob = { 
      sessionId, 
      userId, 
      r2JsonKey: session.r2JsonKey, 
      requestedOutputs 
    };
    
    await this.env.PIPELINE_QUEUE.send(job);

    await this.audit.record({
      eventName: 'export.started',
      userId,
      sessionId,
      properties: { creditCost, ...requestedOutputs }
    });

    return { creditCost, queuedAt: now };
  }
}
