import { Env } from '../types/hono';
import { AuditService } from './AuditService';
import { PipelineJob } from './pipeline/PipelineProcessor';
import { getWorkspaceCredits, creditDeductStatements, checkLowCreditNotify, CreditActionType } from './CreditService';

export class PipelineService {
  private audit: AuditService;

  constructor(private env: Env, private executionCtx?: any) {
    this.audit = new AuditService(env, executionCtx);
  }

  async trigger(userId: string, sessionId: string, requestedOutputs: any, tone?: string) {
    const session = await this.env.DB.prepare(
      'SELECT * FROM sessions WHERE id = ? AND ownerId = ?'
    ).bind(sessionId, userId).first() as any;

    if (!session) {
      console.error(`[PipelineService] NOT_FOUND — sessionId:${sessionId} userId:${userId}`);
      throw new Error('NOT_FOUND');
    }
    console.log(`[PipelineService] session found — status:${session.status} r2JsonKey:${session.r2JsonKey ?? 'NULL'}`);

    const workspaceId = session.workspaceId;
    let finalOutputs = requestedOutputs || {};

    // Build per-output cost entries matching spec
    const costEntries: { actionType: CreditActionType; cost: number }[] = [];
    if (finalOutputs?.sop)   costEntries.push({ actionType: 'narration',  cost: 2 });
    if (finalOutputs?.demo)  costEntries.push({ actionType: 'demo',       cost: 1 });
    if (finalOutputs?.video) costEntries.push({ actionType: 'voiceover',  cost: 3 });

    if (costEntries.length === 0) {
      // Default to narration if extension triggers without specifying
      finalOutputs = { sop: true };
      costEntries.push({ actionType: 'narration', cost: 2 });
    }

    const totalCost = costEntries.reduce((s, e) => s + e.cost, 0);

    const credits = await getWorkspaceCredits(this.env.DB, workspaceId);
    console.log(`[PipelineService] credits — balance:${credits.balanceCredits} cost:${totalCost}`);
    if (credits.balanceCredits < totalCost) {
      console.error(`[PipelineService] INSUFFICIENT_CREDITS — balance:${credits.balanceCredits} cost:${totalCost}`);
      await this.env.DB.prepare('UPDATE sessions SET status = ? WHERE id = ?').bind('credit_exhausted', sessionId).run();
      throw new Error(`INSUFFICIENT_CREDITS:${totalCost}:${credits.balanceCredits}`);
    }

    const now = Date.now();

    // One balance deduction + one ledger row per output type + session status update
    await this.env.DB.batch([
      this.env.DB.prepare('UPDATE workspace_credits SET balanceCredits = balanceCredits - ? WHERE workspaceId = ?')
        .bind(totalCost, workspaceId),
      ...costEntries.map(({ actionType, cost }) =>
        this.env.DB.prepare(
          'INSERT INTO credits_ledger (id, workspaceId, userId, delta, actionType, reason, sessionId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(crypto.randomUUID(), workspaceId, userId, -cost, actionType, actionType, sessionId, now)
      ),
      this.env.DB.prepare('UPDATE sessions SET status = ?, updatedAt = ? WHERE id = ?').bind('processing', now, sessionId),
    ]);

    const job: PipelineJob = {
      sessionId,
      userId,
      r2JsonKey: session.r2JsonKey,
      requestedOutputs: finalOutputs,
      tone,
    };

    console.log(`[PipelineService] sending to queue — job:`, JSON.stringify(job));
    await this.env.PIPELINE_QUEUE.send(job);

    // Best-effort low-credit notification (non-blocking)
    checkLowCreditNotify(this.env.DB, workspaceId).catch(() => {});

    await this.audit.record({
      eventName: 'export.started',
      userId,
      sessionId,
      properties: { totalCost, ...finalOutputs }
    });

    return { creditCost: totalCost, queuedAt: now };
  }
}
