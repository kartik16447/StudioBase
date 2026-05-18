import { Env } from '../types/hono';

export interface SessionEventInput {
  id: string;
  sessionId: string;
  sopId?: string | null;
  workspaceId: string;
  userId?: string | null;
  stepIndex?: number | null;
  eventType: string;
  durationMs?: number | null;
  metadata?: Record<string, any> | null;
  timestamp: number;
}

export class AnalyticsService {
  constructor(private env: Env) {}

  async insertEvents(events: SessionEventInput[]): Promise<void> {
    const stmts = events.map((e) =>
      this.env.DB.prepare(
        `INSERT OR IGNORE INTO session_events
         (id, sessionId, sopId, workspaceId, userId, stepIndex, eventType, durationMs, metadata, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        e.id, e.sessionId, e.sopId ?? null, e.workspaceId,
        e.userId ?? null, e.stepIndex ?? null, e.eventType,
        e.durationMs ?? null, e.metadata ? JSON.stringify(e.metadata) : null, e.timestamp
      )
    );
    if (stmts.length === 1) {
      await stmts[0].run();
    } else if (stmts.length > 1) {
      await this.env.DB.batch(stmts);
    }
  }

  async getSopAnalytics(sopId: string, workspaceId: string) {
    const { results: rows } = await this.env.DB.prepare(
      `SELECT
         stepIndex,
         SUM(CASE WHEN eventType='step_viewed'   THEN 1 ELSE 0 END) as views,
         SUM(CASE WHEN eventType='step_replayed' THEN 1 ELSE 0 END) as replays,
         SUM(CASE WHEN eventType='step_skipped'  THEN 1 ELSE 0 END) as skips,
         AVG(CASE WHEN eventType='step_viewed' AND durationMs IS NOT NULL THEN durationMs END) as avgDwellMs
       FROM session_events
       WHERE sopId = ? AND workspaceId = ?
       GROUP BY stepIndex
       ORDER BY stepIndex ASC`
    ).bind(sopId, workspaceId).all<any>();

    const { results: summary } = await this.env.DB.prepare(
      `SELECT
         COUNT(DISTINCT sessionId) as totalViews,
         SUM(CASE WHEN eventType='sop_completed' THEN 1 ELSE 0 END) as completions,
         AVG(CASE WHEN eventType='sop_completed' AND durationMs IS NOT NULL THEN durationMs END) as avgCompletionTimeMs
       FROM session_events
       WHERE sopId = ? AND workspaceId = ?`
    ).bind(sopId, workspaceId).all<any>();

    const { results: dropoffs } = await this.env.DB.prepare(
      `SELECT stepIndex, COUNT(*) as cnt
       FROM session_events
       WHERE sopId = ? AND workspaceId = ? AND eventType='sop_abandoned'
       GROUP BY stepIndex`
    ).bind(sopId, workspaceId).all<any>();

    const dropoffMap = new Map<number, number>(
      (dropoffs as any[]).map((r) => [r.stepIndex, r.cnt])
    );

    const s = (summary as any[])[0] ?? {};
    const totalViews = s.totalViews ?? 0;
    const completions = s.completions ?? 0;
    const completionRate = totalViews > 0 ? +(completions / totalViews).toFixed(4) : 0;

    const steps = (rows as any[]).map((r) => ({
      stepIndex: r.stepIndex,
      views: r.views ?? 0,
      replays: r.replays ?? 0,
      skips: r.skips ?? 0,
      avgDwellMs: r.avgDwellMs ? Math.round(r.avgDwellMs) : 0,
      dropoffAfter: dropoffMap.get(r.stepIndex) ?? 0,
    }));

    return {
      sopId,
      totalViews,
      completionRate,
      avgCompletionTimeMs: s.avgCompletionTimeMs ? Math.round(s.avgCompletionTimeMs) : 0,
      steps,
    };
  }

  async getWorkspaceAnalytics(workspaceId: string) {
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const { results: sopRows } = await this.env.DB.prepare(
      `SELECT
         se.sopId,
         s.title,
         COUNT(DISTINCT se.sessionId) as views,
         SUM(CASE WHEN se.eventType='sop_completed' THEN 1 ELSE 0 END) as completions,
         AVG(CASE WHEN se.eventType='step_viewed' AND se.durationMs IS NOT NULL THEN se.durationMs END) as avgDwellMs
       FROM session_events se
       LEFT JOIN sops s ON s.id = se.sopId
       WHERE se.workspaceId = ? AND se.timestamp >= ? AND se.sopId IS NOT NULL
       GROUP BY se.sopId, s.title
       ORDER BY views DESC`
    ).bind(workspaceId, since).all<any>();

    // Problem step: the step with most dropoffs per SOP
    const { results: dropoffRows } = await this.env.DB.prepare(
      `SELECT sopId, stepIndex, COUNT(*) as cnt
       FROM session_events
       WHERE workspaceId = ? AND eventType='sop_abandoned' AND timestamp >= ? AND sopId IS NOT NULL
       GROUP BY sopId, stepIndex`
    ).bind(workspaceId, since).all<any>();

    const problemStepMap = new Map<string, number>();
    const tempMap = new Map<string, { stepIndex: number; cnt: number }>();
    for (const r of dropoffRows as any[]) {
      const prev = tempMap.get(r.sopId);
      if (!prev || r.cnt > prev.cnt) tempMap.set(r.sopId, { stepIndex: r.stepIndex, cnt: r.cnt });
    }
    for (const [sopId, v] of tempMap) problemStepMap.set(sopId, v.stepIndex);

    const { results: totals } = await this.env.DB.prepare(
      `SELECT COUNT(DISTINCT sessionId) as totalSessions, COUNT(*) as totalViews
       FROM session_events
       WHERE workspaceId = ? AND timestamp >= ?`
    ).bind(workspaceId, since).all<any>();

    const t = (totals as any[])[0] ?? {};

    const sops = (sopRows as any[]).map((r) => ({
      sopId: r.sopId,
      title: r.title ?? 'Untitled SOP',
      views: r.views ?? 0,
      completionRate: r.views > 0 ? +((r.completions ?? 0) / r.views).toFixed(4) : 0,
      avgDwellMs: r.avgDwellMs ? Math.round(r.avgDwellMs) : 0,
      problemStep: problemStepMap.get(r.sopId) ?? null,
    }));

    return {
      workspaceId,
      period: 'last_30_days',
      totalSessions: t.totalSessions ?? 0,
      totalViews: t.totalViews ?? 0,
      sops,
    };
  }
}
