-- Add sopToDocPromptSeen flag to onboarding_state
ALTER TABLE onboarding_state ADD COLUMN sopToDocPromptSeen INTEGER NOT NULL DEFAULT 0;
