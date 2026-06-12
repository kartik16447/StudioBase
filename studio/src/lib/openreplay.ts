import Tracker from '@openreplay/tracker';

const PROJECT_KEY = import.meta.env.VITE_OPENREPLAY_PROJECT_KEY as string | undefined;

let tracker: Tracker | null = null;

export function initOpenReplay() {
  if (!PROJECT_KEY || tracker) return;
  tracker = new Tracker({ projectKey: PROJECT_KEY });
  tracker.start();
}

export function identifyUser(email: string) {
  if (!tracker) return;
  tracker.setUserID(email);
}
