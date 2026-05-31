export type CreditActionType =
  | 'narration'        // full session AI narration (pipeline sop)
  | 'voiceover'        // full session voiceover (pipeline video)
  | 'demo'             // demo generation (pipeline demo)
  | 'audio_tts'        // single step audio generation
  | 'audio_narration'  // bulk step narration
  | 'audio_swap'       // voice swap per step
  | 'cinematic';       // cinematic unlock

export interface WorkspaceCredits {
  balanceCredits: number;
  monthlyAllocation: number;
  lowCreditNotifiedAt: number | null;
}

export async function getWorkspaceCredits(db: D1Database, workspaceId: string): Promise<WorkspaceCredits> {
  const row = await db
    .prepare('SELECT balanceCredits, monthlyAllocation, lowCreditNotifiedAt FROM workspace_credits WHERE workspaceId = ?')
    .bind(workspaceId)
    .first<WorkspaceCredits>();
  return row ?? { balanceCredits: 0, monthlyAllocation: 50, lowCreditNotifiedAt: null };
}

export function creditDeductStatements(
  db: D1Database,
  workspaceId: string,
  userId: string,
  sessionId: string,
  actionType: CreditActionType,
  cost: number,
  now: number
): D1PreparedStatement[] {
  return [
    db.prepare('UPDATE workspace_credits SET balanceCredits = balanceCredits - ? WHERE workspaceId = ?')
      .bind(cost, workspaceId),
    db.prepare(
      'INSERT INTO credits_ledger (id, workspaceId, userId, delta, actionType, reason, sessionId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), workspaceId, userId, -cost, actionType, actionType, sessionId, now),
  ];
}

export function creditRefundStatements(
  db: D1Database,
  workspaceId: string,
  userId: string,
  sessionId: string,
  actionType: CreditActionType,
  cost: number,
  now: number
): D1PreparedStatement[] {
  const refundReason = `${actionType}_refund`;
  return [
    db.prepare('UPDATE workspace_credits SET balanceCredits = balanceCredits + ? WHERE workspaceId = ?')
      .bind(cost, workspaceId),
    db.prepare(
      'INSERT INTO credits_ledger (id, workspaceId, userId, delta, actionType, reason, sessionId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), workspaceId, userId, cost, refundReason, refundReason, sessionId, now),
  ];
}

/**
 * After a credit deduction, check whether the workspace has crossed the low-credit
 * threshold (< 20% of monthly allocation) for the first time this billing period.
 * If so, fan-out a single in-app notification to all workspace admins and owners,
 * then set lowCreditNotifiedAt to prevent repeat notifications this period.
 *
 * Best-effort — caller should not await or propagate errors from this function.
 */
export async function checkLowCreditNotify(db: D1Database, workspaceId: string): Promise<void> {
  const credits = await db
    .prepare('SELECT balanceCredits, monthlyAllocation, lowCreditNotifiedAt FROM workspace_credits WHERE workspaceId = ?')
    .bind(workspaceId)
    .first<WorkspaceCredits>();

  if (!credits) return;
  if (credits.lowCreditNotifiedAt !== null) return; // already notified this period
  if (credits.balanceCredits >= credits.monthlyAllocation * 0.2) return; // above threshold

  const now = Date.now();

  // Get all admins and owners in this workspace
  const { results: admins } = await db
    .prepare(`SELECT userId FROM workspace_members WHERE workspaceId = ? AND role IN ('Owner', 'Admin', 'owner', 'admin')`)
    .bind(workspaceId)
    .all<{ userId: string }>();

  if (admins.length === 0) return;

  // Fan-out one notification per admin
  const meta = JSON.stringify({
    balanceCredits: credits.balanceCredits,
    monthlyAllocation: credits.monthlyAllocation,
  });

  const statements: D1PreparedStatement[] = [
    // Mark notified before fanning out so a parallel deduction can't double-fire
    db.prepare('UPDATE workspace_credits SET lowCreditNotifiedAt = ? WHERE workspaceId = ?')
      .bind(now, workspaceId),
    ...admins.map(({ userId }) =>
      db.prepare(
        `INSERT OR IGNORE INTO notifications (id, userId, workspaceId, type, actorId, targetId, metadata, createdAt)
         VALUES (?, ?, ?, 'credits.low', NULL, NULL, ?, ?)`
      ).bind(crypto.randomUUID(), userId, workspaceId, meta, now)
    ),
  ];

  await db.batch(statements);
}
