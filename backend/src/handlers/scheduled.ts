import { Env } from '../types/hono';

export async function handleScheduled(event: any, env: Env, ctx: ExecutionContext) {
  console.log('[SCHEDULED] Running platform maintenance...');
  
  // 1. Cleanup old debug logs
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
}
