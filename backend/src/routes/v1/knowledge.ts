import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { authMiddleware } from '../../middlewares/auth';
import { workspaceMiddleware } from '../../middlewares/workspace';

const knowledge = new Hono<{ Bindings: Env; Variables: Variables }>();
knowledge.use('*', authMiddleware(), workspaceMiddleware());

// GET /v1/knowledge?q=search&limit=50
knowledge.get('/', async (c) => {
  const ws = c.get('workspace');
  const q = (c.req.query('q') || '').trim();
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);

  let rows: any[];

  if (q) {
    const like = `%${q}%`;
    const res = await c.env.DB.prepare(`
      SELECT DISTINCT
        s.id AS sessionId,
        s.title,
        s.capturedTitle,
        s.capturedUrl,
        s.shareToken,
        s.isPublic,
        sop.id AS sopId,
        sop.status,
        sop.updatedAt,
        (SELECT COUNT(*) FROM steps st WHERE st.sopId = sop.id) AS stepCount
      FROM sops sop
      JOIN sessions s ON s.id = sop.sessionId
      WHERE sop.workspaceId = ?
        AND sop.status = 'published'
        AND (
          s.title LIKE ?
          OR s.capturedTitle LIKE ?
          OR s.capturedUrl LIKE ?
          OR EXISTS (
            SELECT 1 FROM steps st
            WHERE st.sopId = sop.id
              AND (st.content LIKE ?)
          )
        )
      ORDER BY sop.updatedAt DESC
      LIMIT ?
    `).bind(ws.id, like, like, like, like, limit).all<any>();
    rows = res.results;
  } else {
    const result = await c.env.DB.prepare(`
      SELECT
        s.id AS sessionId,
        s.title,
        s.capturedTitle,
        s.capturedUrl,
        s.shareToken,
        s.isPublic,
        sop.id AS sopId,
        sop.status,
        sop.updatedAt,
        (SELECT COUNT(*) FROM steps st WHERE st.sopId = sop.id) AS stepCount
      FROM sops sop
      JOIN sessions s ON s.id = sop.sessionId
      WHERE sop.workspaceId = ?
        AND sop.status = 'published'
      ORDER BY sop.updatedAt DESC
      LIMIT ?
    `).bind(ws.id, limit).all<any>();
    rows = result.results;
  }

  return c.json({ sops: rows });
});

export { knowledge };
