import type { Step } from '../types/step';

export interface StepDiff {
  stepId: string;
  field: keyof Step;
  before: unknown;
  after: unknown;
}

export function diffSteps(before: Step, after: Step): StepDiff[] {
  const diffs: StepDiff[] = [];
  const fields: (keyof Step)[] = [
    'textOverride', 'generatedText', 'annotations', 'animationTarget', 'voiceoverKey'
  ];
  for (const field of fields) {
    const a = JSON.stringify(before[field]);
    const b = JSON.stringify(after[field]);
    if (a !== b) {
      diffs.push({ stepId: before.id, field, before: before[field], after: after[field] });
    }
  }
  return diffs;
}
