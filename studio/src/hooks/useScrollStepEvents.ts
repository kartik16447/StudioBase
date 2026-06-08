import { useEffect, useRef } from 'react';
import { firePublicEvents } from '../lib/publicAnalyticsClient';

/**
 * IntersectionObserver-based step tracking for scroll views (SharePage, PlayerPage guide).
 * Expects each step card to have id="step-{step.id}" in the DOM.
 */
export function useScrollStepEvents(
  shareToken: string | null,
  steps: Array<{ id: string }>,
  totalSteps: number
): void {
  const enteredAtRef = useRef<Record<number, number>>({});
  const completedRef = useRef(new Set<number>());
  const sopCompletedRef = useRef(false);
  const lastVisibleRef = useRef(-1);

  useEffect(() => {
    if (!shareToken || steps.length === 0) return;

    const observers: IntersectionObserver[] = [];

    steps.forEach((step, index) => {
      const el = document.getElementById(`step-${step.id}`);
      if (!el) return;

      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            enteredAtRef.current[index] = Date.now();
            lastVisibleRef.current = index;
            firePublicEvents([{ shareToken, eventType: 'step_viewed', stepIndex: index }]);
          } else if (
            enteredAtRef.current[index] !== undefined &&
            !completedRef.current.has(index)
          ) {
            const durationMs = Date.now() - enteredAtRef.current[index];
            completedRef.current.add(index);
            firePublicEvents([{
              shareToken,
              eventType: 'step_completed',
              stepIndex: index,
              durationMs,
            }]);
            if (index === totalSteps - 1 && !sopCompletedRef.current) {
              sopCompletedRef.current = true;
              firePublicEvents([{ shareToken, eventType: 'sop_completed' }]);
            }
          }
        },
        { threshold: 0.4 }
      );
      obs.observe(el);
      observers.push(obs);
    });

    const onLeave = () => {
      if (!sopCompletedRef.current && lastVisibleRef.current >= 0) {
        firePublicEvents([{
          shareToken,
          eventType: 'sop_abandoned',
          lastStepIndex: lastVisibleRef.current,
        }]);
      }
    };
    const onVis = () => { if (document.visibilityState === 'hidden') onLeave(); };

    window.addEventListener('beforeunload', onLeave);
    document.addEventListener('visibilitychange', onVis);

    return () => {
      observers.forEach((o) => o.disconnect());
      window.removeEventListener('beforeunload', onLeave);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [shareToken, steps.length, totalSteps]);
}
