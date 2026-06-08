import { V1_API_URL } from '../../../shared/constants';

export type AnalyticsEventType =
  | 'step_viewed'
  | 'step_replayed'
  | 'step_skipped'
  | 'sop_completed'
  | 'sop_abandoned'
  | 'export_triggered'
  | 'reveal_card_viewed'
  | 'reveal_cta_click';

export interface AnalyticsEvent {
  id: string;
  sessionId: string;
  sopId?: string | null;
  workspaceId: string;
  userId?: string | null;
  stepIndex?: number | null;
  eventType: AnalyticsEventType;
  durationMs?: number | null;
  metadata?: Record<string, any> | null;
  timestamp: number;
}

class AnalyticsClient {
  private queue: AnalyticsEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly FLUSH_INTERVAL = 5000;

  constructor() {
    window.addEventListener('beforeunload', () => this.flushSync());
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flushSync();
    });
  }

  track(event: Omit<AnalyticsEvent, 'id' | 'timestamp'>) {
    this.queue.push({
      ...event,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
    });
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.FLUSH_INTERVAL);
    }
  }

  private async flush() {
    this.flushTimer = null;
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0);
    try {
      const token = localStorage.getItem('sb_token') || sessionStorage.getItem('sb_token');
      const workspaceId = localStorage.getItem('sb_active_workspace') || localStorage.getItem('sb_workspaceId');
      await fetch(`${V1_API_URL}/analytics/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(workspaceId ? { 'x-workspace-id': workspaceId } : {}),
        },
        body: JSON.stringify({ events: batch }),
      });
    } catch {
      // fire-and-forget — swallow errors silently
    }
  }

  private flushSync() {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0);
    const token = localStorage.getItem('sb_token') || sessionStorage.getItem('sb_token');
    const workspaceId = localStorage.getItem('sb_active_workspace') || localStorage.getItem('sb_workspaceId');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (workspaceId) headers['x-workspace-id'] = workspaceId;
    navigator.sendBeacon(
      `${V1_API_URL}/analytics/events`,
      new Blob([JSON.stringify({ events: batch })], { type: 'application/json' })
    );
  }
}

export const analyticsClient = new AnalyticsClient();
