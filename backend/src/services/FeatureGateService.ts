import { Env } from '../types/hono';

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

const FREE_FALLBACK: Record<FeatureKey, ResolvedFlag> = {
  'analytics:date_range':       { enabled: true,  limits: { days: 7 } },
  'analytics:export':           { enabled: false, limits: null },
  'analytics:period_comparison':{ enabled: false, limits: null },
  'analytics:viewer_detail':    { enabled: false, limits: null },
  'workspace:bulk_invite':      { enabled: false, limits: null },
  'workspace:transfer_ownership':{ enabled: true, limits: null },
  'workspace:revoke_sessions':  { enabled: true,  limits: null },
  'workspace:session_policy':   { enabled: false, limits: null },
  'workspace:mfa_enforce':      { enabled: false, limits: null },
  'workspace:sso_saml':         { enabled: false, limits: null },
};

export class FeatureGateService {
  constructor(private env: Env) {}

  async resolve(workspaceId: string, featureKey: FeatureKey): Promise<ResolvedFlag> {
    const map = await this.resolveAll(workspaceId);
    return map[featureKey] ?? FREE_FALLBACK[featureKey];
  }

  async resolveAll(workspaceId: string): Promise<FeatureMap> {
    // 1. Get workspace plan
    const planRow = await this.env.DB.prepare(
      `SELECT COALESCE(plan, 'free') as plan, validUntil
       FROM workspace_plans WHERE workspaceId = ?`
    ).bind(workspaceId).first<{ plan: string; validUntil: number | null }>().catch(() => null);

    const now = Date.now();
    const plan = (planRow?.validUntil && planRow.validUntil < now)
      ? 'free'
      : (planRow?.plan ?? 'free');

    // 2. Load plan defaults
    const { results: planRows } = await this.env.DB.prepare(
      `SELECT featureKey, enabled, metadata FROM plan_features WHERE planName = ?`
    ).bind(plan).all<{ featureKey: string; enabled: number; metadata: string | null }>();

    const map: Partial<FeatureMap> = {};

    for (const row of planRows) {
      let limits: Record<string, any> | null = null;
      if (row.metadata) {
        try { limits = JSON.parse(row.metadata); } catch {}
      }
      map[row.featureKey as FeatureKey] = { enabled: row.enabled === 1, limits };
    }

    // 3. Apply workspace overrides (sales / pilot / beta)
    const { results: overrideRows } = await this.env.DB.prepare(
      `SELECT featureKey, enabled, metadata
       FROM workspace_feature_overrides
       WHERE workspaceId = ? AND (expiresAt IS NULL OR expiresAt > ?)`
    ).bind(workspaceId, now).all<{ featureKey: string; enabled: number; metadata: string | null }>();

    for (const row of overrideRows) {
      let limits: Record<string, any> | null = (map[row.featureKey as FeatureKey]?.limits) ?? null;
      if (row.metadata) {
        try { limits = JSON.parse(row.metadata); } catch {}
      }
      map[row.featureKey as FeatureKey] = { enabled: row.enabled === 1, limits };
    }

    // Fill any missing keys with free fallbacks
    for (const key of Object.keys(FREE_FALLBACK) as FeatureKey[]) {
      if (!map[key]) map[key] = FREE_FALLBACK[key];
    }

    return map as FeatureMap;
  }
}
