import { useEffect, useRef } from 'react';
import { firePublicEvents } from '../lib/publicAnalyticsClient';

/**
 * Step tracking for index-based navigation (embed views that advance via stepIndex).
 * Fire step_viewed on each new index, step_completed when leaving, sop_completed at last step,
 * sop_abandoned on beforeunload / visibilitychange.
 */
export function useIndexStepEvents(
  shareToken: string | null,
  stepIndex: number,
  totalSteps: number
): void {
  const prevIndexRef = useRef(-1);
  const enteredAtRef = useRef(Date.now());
  const sopCompletedRef = useRef(false);
  const firedViewedRef = useRef(new Set<number>());

  useEffect(() => {
    if (!shareToken || totalSteps === 0) return;

    if (!firedViewedRef.current.has(stepIndex)) {
      firedViewedRef.current.add(stepIndex);
      firePublicEvents([{ shareToken, eventType: 'step_viewed', stepIndex }]);
    }

    if (prevIndexRef.current >= 0 && prevIndexRef.current !== stepIndex) {
      const durationMs = Date.now() - enteredAtRef.current;
      firePublicEvents([{
        shareToken,
        eventType: 'step_completed',
        stepIndex: prevIndexRef.current,
        durationMs,
      }]);
    }

    if (stepIndex === totalSteps - 1 && !sopCompletedRef.current) {
      sopCompletedRef.current = true;
      firePublicEvents([{ shareToken, eventType: 'sop_completed' }]);
    }

    prevIndexRef.current = stepIndex;
    enteredAtRef.current = Date.now();
  }, [shareToken, stepIndex, totalSteps]);

  useEffect(() => {
    if (!shareToken) return;
    const onLeave = () => {
      if (!sopCompletedRef.current && prevIndexRef.current >= 0) {
        firePublicEvents([{
          shareToken,
          eventType: 'sop_abandoned',
          lastStepIndex: prevIndexRef.current,
        }]);
      }
    };
    const onVis = () => { if (document.visibilityState === 'hidden') onLeave(); };
    window.addEventListener('beforeunload', onLeave);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('beforeunload', onLeave);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [shareToken]);
}
