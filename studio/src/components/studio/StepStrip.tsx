import React from 'react';
import type { Step } from '../../../../shared/types/session';
import { cn, StepNumber } from '../ui';
import { displayText } from '../../lib/textUtils';

interface StepStripProps {
  steps: Step[];
  focusedStepId: string | null;
  onPick?: (id: string) => void;
}

export const StepStrip: React.FC<StepStripProps> = ({ steps, focusedStepId, onPick }) => {
  return (
    <div className="space-y-1">
      {steps.map(s => (
        <button
          key={s.id}
          onClick={() => onPick?.(s.id)}
          className={cn(
            'w-full flex items-start gap-3 p-2.5 rounded-sm text-left transition-colors',
            focusedStepId === s.id ? 'bg-primary-light' : 'hover:bg-surface-2',
          )}
        >
          <StepNumber n={s.sequence} size="badge" />
          <span className={cn(
            'text-[13px] leading-snug line-clamp-2',
            focusedStepId === s.id ? 'text-text font-medium' : 'text-text-2',
          )}>
            {displayText(s.textOverride || s.generatedText).slice(0, 90)}
          </span>
        </button>
      ))}
    </div>
  );
};
