import { BACKEND_URL } from '../../../shared/constants';

export function buildFingerprint(): string {
  return btoa(
    [
      navigator.language,
      screen.width,
      screen.height,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ].join('|')
  );
}

interface PubEvent {
  shareToken: string;
  eventType: string;
  stepIndex?: number;
  durationMs?: number;
  lastStepIndex?: number;
  metadata?: Record<string, any>;
}

export function firePublicEvents(events: PubEvent[]): void {
  if (events.length === 0) return;
  const fingerprint = buildFingerprint();
  const stamped = events.map((e) => ({
    ...e,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    viewerFingerprint: fingerprint,
  }));
  fetch(`${BACKEND_URL}/v1/public/analytics/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: stamped }),
    keepalive: true,
  }).catch(() => {});
}

/** Extract shareToken from paths like /s/:token */
export function getShareTokenFromPath(): string | null {
  const m = window.location.pathname.match(/\/s\/([^/?#]+)/);
  return m ? m[1] : null;
}
