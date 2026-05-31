-- ============================================================
-- Migration 0023: Workspace Credits Pool
-- Moves credits from per-user balances to per-workspace pool
-- ============================================================

-- 1. Workspace credits table
CREATE TABLE IF NOT EXISTS workspace_credits (
  id TEXT PRIMARY KEY,
  workspaceId TEXT NOT NULL UNIQUE REFERENCES workspaces(id),
  balanceCredits INTEGER NOT NULL DEFAULT 0,
  monthlyAllocation INTEGER NOT NULL DEFAULT 50,
  rolloverCredits INTEGER NOT NULL DEFAULT 0,
  lastRefreshedAt INTEGER,
  billingCycleDay INTEGER NOT NULL DEFAULT 1,
  lowCreditNotifiedAt INTEGER
);

CREATE INDEX IF NOT EXISTS idx_workspace_credits_workspaceId ON workspace_credits(workspaceId);

-- 2. Extend credits_ledger with workspace scope and structured action type
ALTER TABLE credits_ledger ADD COLUMN workspaceId TEXT;
ALTER TABLE credits_ledger ADD COLUMN actionType TEXT;

-- 3. Seed workspace_credits from existing owner balances + plan data
--    balanceCredits = owner's current creditsBalance
--    monthlyAllocation = 50 (free) | 500 (pro/enterprise)
INSERT OR IGNORE INTO workspace_credits (id, workspaceId, balanceCredits, monthlyAllocation, rolloverCredits, lastRefreshedAt, billingCycleDay)
SELECT
  lower(hex(randomblob(16))),
  w.id,
  COALESCE(u.creditsBalance, 0),
  CASE
    WHEN COALESCE(wp.plan, 'free') = 'pro'        THEN 500
    WHEN COALESCE(wp.plan, 'free') = 'enterprise' THEN 500
    ELSE 50
  END,
  0,
  strftime('%s','now') * 1000,
  1
FROM workspaces w
JOIN users u ON w.ownerId = u.id
LEFT JOIN workspace_plans wp ON wp.workspaceId = w.id;
