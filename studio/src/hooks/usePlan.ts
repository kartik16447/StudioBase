/**
 * usePlan — reads the active workspace plan from localStorage.
 *
 * The plan is written when the workspace list is fetched on app load
 * (WorkspaceService.listByUser now joins workspace_plans).
 *
 * Plan tiers: 'free' | 'pro' | 'enterprise'
 *
 * Feature matrix:
 *   free       → core features only (record, SOP, raw video share)
 *   pro        → + cinematic share, audio voiceover, advanced export
 *   enterprise → + SSO, audit logs, governance, white-label
 */

export type PlanTier = 'free' | 'pro' | 'enterprise';

const PLAN_KEY = 'sb_workspace_plan';

/** Write the plan to localStorage (called after workspace fetch). */
export function storePlan(plan: string) {
  try { localStorage.setItem(PLAN_KEY, plan); } catch {}
}

/** Read the active plan — defaults to 'free' if missing. */
export function getPlan(): PlanTier {
  try {
    const stored = localStorage.getItem(PLAN_KEY);
    if (stored === 'pro' || stored === 'enterprise') return stored;
  } catch {}
  return 'free';
}

/** React hook — returns the active plan tier. */
export function usePlan(): PlanTier {
  // No reactive subscription needed — plan changes require full page reload
  // (workspace switch). A simple read is sufficient.
  return getPlan();
}

// ── Feature flags ─────────────────────────────────────────────────────────────

export const PLAN_FEATURES = {
  /** Sharing the AI cinematic player requires ≥ pro (or credit purchase). */
  cinematicShare:   (plan: PlanTier) => plan === 'pro' || plan === 'enterprise',
  /** AI voiceover generation requires ≥ pro. */
  audioVoiceover:   (plan: PlanTier) => plan === 'pro' || plan === 'enterprise',
  /** SSO configuration is enterprise-only. */
  sso:              (plan: PlanTier) => plan === 'enterprise',
  /** Audit logs are enterprise-only. */
  auditLogs:        (plan: PlanTier) => plan === 'enterprise',
  /** Advanced governance (role matrix, data retention config) is enterprise-only. */
  governance:       (plan: PlanTier) => plan === 'enterprise',
  /** White-label / custom branding is enterprise-only. */
  whiteLabel:       (plan: PlanTier) => plan === 'enterprise',
} as const;
