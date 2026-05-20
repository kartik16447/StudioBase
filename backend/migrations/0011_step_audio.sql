-- Audio state per step — mutable, D1 is authoritative (R2 envelope is immutable step content)
-- jobId + jobStartedAt enable stuck-state TTL recovery on GET /audio-status
CREATE TABLE IF NOT EXISTS step_audio (
  stepId                TEXT NOT NULL,
  sessionId             TEXT NOT NULL,
  userId                TEXT NOT NULL,
  voiceoverKey          TEXT,
  originalVoiceoverKey  TEXT,
  syntheticVoiceoverKey TEXT,
  voiceoverSource       TEXT CHECK(voiceoverSource IN ('original', 'tts', 'swap', 'generating')),
  voiceoverDurationMs   INTEGER,
  jobId                 TEXT,
  jobStartedAt          INTEGER,
  createdAt             INTEGER NOT NULL,
  updatedAt             INTEGER NOT NULL,
  PRIMARY KEY (stepId, sessionId)
);

CREATE INDEX IF NOT EXISTS idx_step_audio_session ON step_audio(sessionId);
