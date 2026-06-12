import { useStudioStore } from '../store/useStudioStore';
import { type FeatureKey, FREE_FLAG_DEFAULTS } from '../lib/featureFlags';

export function useFeatureFlag(key: FeatureKey) {
  const features = useStudioStore(s => s.features);
  return features?.[key] ?? FREE_FLAG_DEFAULTS[key];
}

// Convenience: returns just the boolean
export function useFlag(key: FeatureKey): boolean {
  return useFeatureFlag(key).enabled;
}
