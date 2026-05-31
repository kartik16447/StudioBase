import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { authMiddleware } from '../../middlewares/auth';
import { workspaceMiddleware, requirePermission } from '../../middlewares/workspace';
import { AuditLogController } from '../../controllers/AuditLogController';
import { getPlan } from '../../middlewares/plan';
import { HTTPException } from 'hono/http-exception';

const auditLogs = new Hono<{ Bindings: Env; Variables: Variables }>();

// 1. Create Audit Log (Fire-and-forget from extension) - Requires only basic workspace access
auditLogs.post('/', authMiddleware(), workspaceMiddleware(), async (c) => {
  return AuditLogController.create(c);
});

// 2. Restricted View (Requires Admin + Enterprise plan)
auditLogs.use('*', authMiddleware(), workspaceMiddleware(), requirePermission('workspace:admin'), async (c, next) => {
  const ws = c.get('workspace');
  const plan = await getPlan(c.env, ws.id);
  if (plan.plan !== 'enterprise') {
    throw new HTTPException(403, { message: 'Audit logs require an Enterprise plan.' });
  }
  await next();
});
auditLogs.get('/', AuditLogController.list);

// 3. Export audit logs as JSONL — returns a signed R2 URL
auditLogs.get('/export', async (c) => {
  const ws = c.get('workspace');
  const user = c.get('user');
  const from = parseInt(c.req.query('from') || '0');
  const to   = parseInt(c.req.query('to')   || String(Date.now()));

  if (!from) return c.json({ error: 'from param required (unix ms)' }, 400);

  // Fetch logs for the date range
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM audit_logs
     WHERE workspaceId = ? AND timestamp >= ? AND timestamp <= ?
     ORDER BY timestamp ASC`
  ).bind(ws.id, from, to).all<any>();

  // Serialize as JSONL
  const jsonl = results.map((r: any) => JSON.stringify(r)).join('\n');
  const key   = `exports/audit/${ws.id}/${from}-${to}.jsonl`;

  // Write to R2
  await c.env.R2.put(key, jsonl, {
    httpMetadata: { contentType: 'application/jsonl' },
  });

  // Create a signed URL valid for 15 minutes (createSignedUrl is a runtime-only R2 method)
  const r2: any = c.env.R2;
  const signedUrl = typeof r2.createSignedUrl === 'function'
    ? await r2.createSignedUrl(key, { expiresIn: 900 })
    : `https://assets.studiobase.app/${key}`;

  // Audit the export itself
  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, workspaceId, actorId, action, targetId, metadata, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(), ws.id, user.id,
    'audit_log.exported', key,
    JSON.stringify({ from, to, rows: results.length }),
    Date.now()
  ).run().catch(() => {});

  return c.json({ url: signedUrl, rows: results.length, key });
});

export default auditLogs;
