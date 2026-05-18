import React from 'react';

export interface StepData {
  stepIndex: number;
  views: number;
  replays: number;
  skips: number;
  avgDwellMs: number;
  dropoffAfter: number;
}

interface Props {
  steps: StepData[];
  sopTitle: string;
}

export const StepHeatmap: React.FC<Props> = ({ steps, sopTitle }) => {
  const maxViews = Math.max(...steps.map((s) => s.views), 1);

  return (
    <div className="bg-white rounded-xl p-6 border border-border shadow-sm space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-[11px] font-bold text-text-3 uppercase tracking-widest">Step breakdown</div>
        <div className="text-[11px] text-text-2 font-medium truncate">— {sopTitle}</div>
      </div>
      {steps.map((step) => {
        const barPct = (step.views / maxViews) * 100;
        const isProblematic = step.dropoffAfter > 0 && step.dropoffAfter >= steps[0]?.views * 0.08;
        return (
          <div key={step.stepIndex} className="flex items-center gap-4">
            <div className="w-14 shrink-0 text-[12px] text-text-3 tabular-nums text-right font-medium">
              Step {step.stepIndex + 1}
            </div>
            <div className="flex-1 h-4 bg-surface-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isProblematic ? 'bg-yellow-400' : 'bg-primary'}`}
                style={{ width: `${barPct}%` }}
              />
            </div>
            <div className="w-[80px] shrink-0 text-[12px] text-text-2 tabular-nums">
              {(step.avgDwellMs / 1000).toFixed(1)}s avg
            </div>
            <div className="w-[90px] shrink-0 text-[12px] tabular-nums">
              {step.dropoffAfter > 0
                ? <span className={isProblematic ? 'text-yellow-600 font-semibold' : 'text-text-2'}>{step.dropoffAfter} drops {isProblematic ? '⚠' : ''}</span>
                : <span className="text-text-3">0 drops</span>}
            </div>
          </div>
        );
      })}
      {steps.length === 0 && (
        <p className="text-text-3 text-sm text-center py-4">No step data yet.</p>
      )}
    </div>
  );
};
