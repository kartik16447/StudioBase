-- Feature gate infrastructure
-- plan_features: default flag state per plan
-- workspace_feature_overrides: per-workspace overrides (sales, pilots, beta)

CREATE TABLE IF NOT EXISTS plan_features (
  planName    TEXT NOT NULL,
  featureKey  TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  metadata    TEXT, -- JSON: e.g. {"days":90} for analytics:date_range
  PRIMARY KEY (planName, featureKey)
);

CREATE TABLE IF NOT EXISTS workspace_feature_overrides (
  workspaceId   TEXT NOT NULL,
  featureKey    TEXT NOT NULL,
  enabled       INTEGER NOT NULL,
  overrideReason TEXT,
  expiresAt     INTEGER, -- null = permanent
  grantedBy     TEXT,    -- userId of admin who set it
  createdAt     INTEGER NOT NULL,
  PRIMARY KEY (workspaceId, featureKey),
  FOREIGN KEY (workspaceId) REFERENCES workspaces(id)
);

-- ── Seed: free plan ──────────────────────────────────────────────────────────
INSERT OR IGNORE INTO plan_features (planName, featureKey, enabled, metadata) VALUES
  ('free', 'analytics:date_range',      1, '{"days":7}'),
  ('free', 'analytics:export',          0, NULL),
  ('free', 'analytics:period_comparison', 0, NULL),
  ('free', 'analytics:viewer_detail',   0, NULL),
  ('free', 'workspace:bulk_invite',     0, NULL),
  ('free', 'workspace:transfer_ownership', 1, NULL),
  ('free', 'workspace:revoke_sessions', 1, NULL),
  ('free', 'workspace:session_policy',  0, NULL),
  ('free', 'workspace:mfa_enforce',     0, NULL),
  ('free', 'workspace:sso_saml',        0, NULL);

-- ── Seed: team plan ──────────────────────────────────────────────────────────
INSERT OR IGNORE INTO plan_features (planName, featureKey, enabled, metadata) VALUES
  ('team', 'analytics:date_range',      1, '{"days":90}'),
  ('team', 'analytics:export',          1, NULL),
  ('team', 'analytics:period_comparison', 1, NULL),
  ('team', 'analytics:viewer_detail',   1, NULL),
  ('team', 'workspace:bulk_invite',     1, NULL),
  ('team', 'workspace:transfer_ownership', 1, NULL),
  ('team', 'workspace:revoke_sessions', 1, NULL),
  ('team', 'workspace:session_policy',  0, NULL),
  ('team', 'workspace:mfa_enforce',     0, NULL),
  ('team', 'workspace:sso_saml',        0, NULL);

-- ── Seed: enterprise plan ────────────────────────────────────────────────────
INSERT OR IGNORE INTO plan_features (planName, featureKey, enabled, metadata) VALUES
  ('enterprise', 'analytics:date_range',      1, '{"days":null}'),
  ('enterprise', 'analytics:export',          1, NULL),
  ('enterprise', 'analytics:period_comparison', 1, NULL),
  ('enterprise', 'analytics:viewer_detail',   1, NULL),
  ('enterprise', 'workspace:bulk_invite',     1, NULL),
  ('enterprise', 'workspace:transfer_ownership', 1, NULL),
  ('enterprise', 'workspace:revoke_sessions', 1, NULL),
  ('enterprise', 'workspace:session_policy',  1, NULL),
  ('enterprise', 'workspace:mfa_enforce',     1, NULL),
  ('enterprise', 'workspace:sso_saml',        1, NULL);
