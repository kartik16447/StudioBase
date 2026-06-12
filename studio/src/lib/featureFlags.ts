export type FeatureKey =
  | 'analytics:date_range'
  | 'analytics:export'
  | 'analytics:period_comparison'
  | 'analytics:viewer_detail'
  | 'workspace:bulk_invite'
  | 'workspace:transfer_ownership'
  | 'workspace:revoke_sessions'
  | 'workspace:session_policy'
  | 'workspace:mfa_enforce'
  | 'workspace:sso_saml';

export interface ResolvedFlag {
  enabled: boolean;
  limits: Record<string, any> | null;
}

export type FeatureMap = Record<FeatureKey, ResolvedFlag>;

// Free-tier fallback used before flags are loaded or when the API fails
export const FREE_FLAG_DEFAULTS: FeatureMap = {
  'analytics:date_range':        { enabled: true,  limits: { days: 7 } },
  'analytics:export':            { enabled: false, limits: null },
  'analytics:period_comparison': { enabled: false, limits: null },
  'analytics:viewer_detail':     { enabled: false, limits: null },
  'workspace:bulk_invite':       { enabled: false, limits: null },
  'workspace:transfer_ownership':{ enabled: true,  limits: null },
  'workspace:revoke_sessions':   { enabled: true,  limits: null },
  'workspace:session_policy':    { enabled: false, limits: null },
  'workspace:mfa_enforce':       { enabled: false, limits: null },
  'workspace:sso_saml':          { enabled: false, limits: null },
};
