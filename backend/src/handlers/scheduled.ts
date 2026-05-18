import { Env } from '../types/hono';

export async function handleScheduled(event: any, env: Env, ctx: ExecutionContext) {
  console.log('[SCHEDULED] Running platform maintenance...');

  // 1. Cleanup old debug logs (14 days)
  ctx.waitUntil((async () => {
    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    await env.DB.prepare('DELETE FROM debug_logs WHERE timestamp < datetime(?, "unixepoch")')
      .bind(Math.floor(fourteenDaysAgo / 1000)).run()
      .catch(err => console.error('[SCHEDULED] Debug logs cleanup failed:', err));
  })());

  // 2. Cleanup expired invites
  ctx.waitUntil((async () => {
    await env.DB.prepare('DELETE FROM invites WHERE expiresAt < ? AND revokedAt IS NULL')
      .bind(Date.now()).run()
      .catch(err => console.error('[SCHEDULED] Invites cleanup failed:', err));
  })());

  // 3. Data retention — purge sessions beyond each workspace's retentionDays
  ctx.waitUntil((async () => {
    try {
      // Get all workspaces with a custom retention policy
      const { results: plans } = await env.DB.prepare(
        `SELECT workspaceId, retentionDays FROM workspace_plans WHERE retentionDays IS NOT NULL`
      ).all<{ workspaceId: string; retentionDays: number }>();

      for (const plan of plans) {
        const cutoff = Date.now() - plan.retentionDays * 24 * 60 * 60 * 1000;

        // Find expired sessions
        const { results: expired } = await env.DB.prepare(
          `SELECT id FROM sessions WHERE workspaceId = ? AND createdAt < ? AND deletedAt IS NULL`
        ).bind(plan.workspaceId, cutoff).all<{ id: string }>();

        if (expired.length === 0) continue;

        const ids = expired.map(r => r.id);

        // Delete R2 assets for each session
        for (const sessionId of ids) {
          const { results: assets } = await env.DB.prepare(
            `SELECT r2Key FROM session_assets WHERE sessionId = ?`
          ).bind(sessionId).all<{ r2Key: string }>().catch(() => ({ results: [] }));

          for (const asset of assets) {
            await env.R2.delete(asset.r2Key).catch(() => {});
          }
        }

        // Soft-delete sessions in D1
        const placeholders = ids.map(() => '?').join(',');
        await env.DB.prepare(
          `UPDATE sessions SET deletedAt = ? WHERE id IN (${placeholders})`
        ).bind(Date.now(), ...ids).run();

        // Audit each purge batch
        await env.DB.prepare(
          `INSERT INTO audit_logs (id, workspaceId, actorId, action, targetId, metadata, createdAt)
           VALUES (?, ?, 'system', 'retention.purge', ?, ?, ?)`
        ).bind(
          crypto.randomUUID(),
          plan.workspaceId,
          plan.workspaceId,
          JSON.stringify({ purged: ids.length, cutoffMs: cutoff, retentionDays: plan.retentionDays }),
          Date.now()
        ).run().catch(() => {});

        console.log(`[SCHEDULED] Retention purge: ${ids.length} sessions for workspace ${plan.workspaceId}`);
      }
    } catch (err) {
      console.error('[SCHEDULED] Retention purge failed:', err);
    }
  })());
}
