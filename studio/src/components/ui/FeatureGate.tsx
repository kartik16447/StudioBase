import React from 'react';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import type { FeatureKey } from '../../lib/featureFlags';

interface FeatureGateProps {
  feature: FeatureKey;
  children: React.ReactNode;
  // Optional: render this instead of null when disabled
  fallback?: React.ReactNode;
  // Optional: render an inline upgrade nudge chip when disabled
  showUpgradeNudge?: boolean;
}

export const FeatureGate: React.FC<FeatureGateProps> = ({
  feature,
  children,
  fallback,
  showUpgradeNudge = false,
}) => {
  const { enabled } = useFeatureFlag(feature);

  if (enabled) return <>{children}</>;

  if (fallback !== undefined) return <>{fallback}</>;

  if (showUpgradeNudge) return <UpgradeNudge feature={feature} />;

  return null;
};

// Minimal inline nudge — shown in place of locked UI elements
const PLAN_LABELS: Partial<Record<FeatureKey, string>> = {
  'analytics:export':            'Team',
  'analytics:period_comparison': 'Team',
  'analytics:viewer_detail':     'Team',
  'workspace:bulk_invite':       'Team',
  'workspace:session_policy':    'Enterprise',
  'workspace:mfa_enforce':       'Enterprise',
  'workspace:sso_saml':          'Enterprise',
};

const UpgradeNudge: React.FC<{ feature: FeatureKey }> = ({ feature }) => {
  const plan = PLAN_LABELS[feature] ?? 'Team';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11.5, fontWeight: 600,
      background: plan === 'Enterprise' ? 'rgba(236,72,153,0.08)' : 'rgba(94,92,230,0.08)',
      color: plan === 'Enterprise' ? '#BE185D' : '#5E5CE6',
      border: `1px solid ${plan === 'Enterprise' ? 'rgba(236,72,153,0.2)' : 'rgba(94,92,230,0.2)'}`,
      borderRadius: 99, padding: '3px 10px', cursor: 'pointer',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, sans-serif',
    }}>
      ✦ {plan}
    </span>
  );
};
