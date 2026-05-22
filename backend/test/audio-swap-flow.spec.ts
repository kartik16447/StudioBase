import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import worker from '../src/index';
import { handleQueue } from '../src/handlers/queue';
import { ElevenLabsAdapter } from '../src/services/audio/ElevenLabsAdapter';
import { sign } from 'hono/jwt';

const schema = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    picture TEXT,
    r2StorageUsedBytes INTEGER NOT NULL DEFAULT 0,
    r2StorageQuotaBytes INTEGER NOT NULL DEFAULT 1073741824,
    creditsBalance INTEGER NOT NULL DEFAULT 10,
    migrated INTEGER NOT NULL DEFAULT 1,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    lastLoginAt INTEGER
  );`,
  `CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    ownerId TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    brandConfig TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS workspace_members (
    userId TEXT NOT NULL REFERENCES users(id),
    workspaceId TEXT NOT NULL REFERENCES workspaces(id),
    role TEXT NOT NULL DEFAULT 'member',
    joinedAt INTEGER NOT NULL,
    PRIMARY KEY (userId, workspaceId)
  );`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL REFERENCES users(id),
    workspaceId TEXT NOT NULL REFERENCES workspaces(id),
    sessionType TEXT NOT NULL DEFAULT 'steps',
    status TEXT NOT NULL DEFAULT 'uploading',
    title TEXT,
    capturedUrl TEXT,
    capturedTitle TEXT,
    durationMs INTEGER DEFAULT 0,
    stepCount INTEGER DEFAULT 0,
    r2JsonKey TEXT,
    r2VideoKey TEXT,
    storageBytes INTEGER DEFAULT 0,
    pipelinePath TEXT,
    generatedOutputs TEXT,
    isPublic INTEGER NOT NULL DEFAULT 0,
    shareToken TEXT UNIQUE,
    deletedAt INTEGER,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS credits_ledger (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id),
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    sessionId TEXT REFERENCES sessions(id),
    createdAt INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS step_audio (
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
    swapVoiceId           TEXT,
    PRIMARY KEY (stepId, sessionId)
  );`,
  `CREATE TABLE IF NOT EXISTS analytics_events (
    id TEXT PRIMARY KEY,
    eventName TEXT NOT NULL,
    userId TEXT,
    workspaceId TEXT,
    sessionId TEXT,
    platform TEXT,
    clientVersion TEXT,
    properties TEXT,
    timestamp INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actorId TEXT NOT NULL,
    workspaceId TEXT,
    action TEXT NOT NULL,
    targetId TEXT,
    metadata TEXT,
    timestamp INTEGER NOT NULL
  );`
];

async function runMigrations(db: any) {
  for (const sql of schema) {
    await db.prepare(sql).run();
  }
}

describe('Audio Voice Swap & Credits Pipeline', () => {
  const userId = 'user-test-123';
  const workspaceId = 'workspace-test-123';
  const sessionId = 'session-test-123';
  const stepId = 'step-0';
  let jwtToken: string;

  beforeAll(async () => {
    // Run migrations on mock D1
    await runMigrations(env.DB);

    // Create a valid JWT token
    jwtToken = await sign(
      {
        id: userId,
        email: 'test@test.com',
        workspaceId: workspaceId,
        role: 'owner',
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      env.ENCRYPTION_KEY
    );
  });

  beforeEach(async () => {
    // Clean tables and seed test user/workspace/session
    await env.DB.prepare('DELETE FROM credits_ledger').run();
    await env.DB.prepare('DELETE FROM step_audio').run();
    await env.DB.prepare('DELETE FROM sessions').run();
    await env.DB.prepare('DELETE FROM workspace_members').run();
    await env.DB.prepare('DELETE FROM workspaces').run();
    await env.DB.prepare('DELETE FROM users').run();

    const now = Date.now();
    // Seed user with 10 credits
    await env.DB.prepare(
      'INSERT INTO users (id, email, creditsBalance, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)'
    ).bind(userId, 'test@test.com', 10, now, now).run();

    await env.DB.prepare(
      'INSERT INTO workspaces (id, slug, ownerId, name, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(workspaceId, 'test-slug', userId, 'Test Workspace', now, now).run();

    await env.DB.prepare(
      'INSERT INTO workspace_members (userId, workspaceId, role, joinedAt) VALUES (?, ?, ?, ?)'
    ).bind(userId, workspaceId, 'owner', now).run();

    await env.DB.prepare(
      'INSERT INTO sessions (id, ownerId, workspaceId, sessionType, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(sessionId, userId, workspaceId, 'steps', 'ready', now, now).run();

    // Insert an initial step audio track that will be swapped
    await env.DB.prepare(`
      INSERT INTO step_audio (
        stepId, sessionId, userId, voiceoverKey, originalVoiceoverKey,
        syntheticVoiceoverKey, voiceoverSource, voiceoverDurationMs,
        jobId, jobStartedAt, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, 'original', ?, NULL, NULL, ?, ?)
    `).bind(
      stepId,
      sessionId,
      userId,
      'audio/sessions/session-test-123/steps/step-0/orig.wav',
      null,
      'audio/sessions/session-test-123/steps/step-0/orig.wav',
      2500,
      now,
      now
    ).run();

    // Put a dummy original audio file in mock R2
    await env.R2.put('audio/sessions/session-test-123/steps/step-0/orig.wav', new ArrayBuffer(500), {
      httpMetadata: { contentType: 'audio/wav' }
    });
  });

  it('deducts 1 credit, updates step state, and queues the job on POST /swap-voice', async () => {
    // Mock Queue send to just track calls
    const queueCalls: any[] = [];
    env.AUDIO_QUEUE = {
      send: async (msg: any) => {
        queueCalls.push(msg);
      }
    } as any;

    const request = new Request(
      `http://localhost/v1/sessions/${sessionId}/steps/${stepId}/swap-voice?workspaceId=${workspaceId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json',
          'x-workspace-id': workspaceId,
        },
        body: JSON.stringify({ voiceId: '2EiwWnXF2V4jofwvRnss' }),
      }
    );

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(202);
    const body = await response.json() as any;
    expect(body.jobId).toBeDefined();

    // 1. Verify creditsBalance is now 9 (deducted by 1)
    const user = await env.DB.prepare('SELECT creditsBalance FROM users WHERE id = ?').bind(userId).first() as any;
    expect(user.creditsBalance).toBe(9);

    // 2. Verify ledger has audit entry
    const ledger = await env.DB.prepare('SELECT * FROM credits_ledger WHERE userId = ?').bind(userId).all() as any;
    expect(ledger.results.length).toBe(1);
    expect(ledger.results[0].delta).toBe(-1);
    expect(ledger.results[0].reason).toBe('audio_swap');

    // 3. Verify step state in D1 is 'generating' and originalVoiceoverKey is populated
    const audio = await env.DB.prepare('SELECT * FROM step_audio WHERE stepId = ? AND sessionId = ?')
      .bind(stepId, sessionId).first() as any;
    expect(audio.voiceoverSource).toBe('generating');
    expect(audio.originalVoiceoverKey).toBe('audio/sessions/session-test-123/steps/step-0/orig.wav');
    expect(audio.jobId).toBe(body.jobId);

    // 4. Verify job was pushed to queue
    expect(queueCalls.length).toBe(1);
    expect(queueCalls[0]).toEqual({
      type: 'audio_swap',
      sessionId,
      stepId,
      voiceId: '2EiwWnXF2V4jofwvRnss',
      userId,
      workspaceId,
      jobId: body.jobId,
    });
  });

  it('completes the voice swap successfully via the queue worker', async () => {
    // Spy on swapVoice to succeed
    const swapSpy = vi.spyOn(ElevenLabsAdapter.prototype, 'swapVoice').mockResolvedValue({
      buffer: new Uint8Array([1, 2, 3]).buffer,
      mimeType: 'audio/mpeg',
      durationMs: 4200,
    });

    // Manually trigger queue processing with attempts = 1
    const jobId = 'test-job-id-success';
    const queueMsg = {
      type: 'audio_swap',
      sessionId,
      stepId,
      voiceId: '2EiwWnXF2V4jofwvRnss',
      userId,
      workspaceId,
      jobId,
    };

    const batch = {
      messages: [
        {
          id: 'msg-1',
          body: queueMsg,
          attempts: 1,
          ack: vi.fn(),
          retry: vi.fn(),
        }
      ]
    };

    const ctx = createExecutionContext();
    await handleQueue(batch as any, env, ctx);

    // 1. Verify swapVoice was called
    expect(swapSpy).toHaveBeenCalledWith(expect.any(ArrayBuffer), '2EiwWnXF2V4jofwvRnss');

    // 2. Verify output is uploaded to R2
    const r2Key = `audio/sessions/${sessionId}/steps/${stepId}/swap-2EiwWnXF2V4jofwvRnss.mp3`;
    const r2Obj = await env.R2.get(r2Key);
    expect(r2Obj).toBeDefined();
    const r2Buf = await r2Obj?.arrayBuffer();
    expect(new Uint8Array(r2Buf!)[0]).toBe(1);

    // 3. Verify step state is updated to 'swap' and jobId is cleared
    const audio = await env.DB.prepare('SELECT * FROM step_audio WHERE stepId = ? AND sessionId = ?')
      .bind(stepId, sessionId).first() as any;
    expect(audio.voiceoverSource).toBe('swap');
    expect(audio.voiceoverKey).toBe(r2Key);
    expect(audio.voiceoverDurationMs).toBe(4200);
    expect(audio.jobId).toBeNull();

    // 4. Verify message was acknowledged
    expect(batch.messages[0].ack).toHaveBeenCalled();
  });

  it('refunds credit and rolls back step state on terminal queue failure (attempts > 3)', async () => {
    // Spy on swapVoice to throw an error
    const swapSpy = vi.spyOn(ElevenLabsAdapter.prototype, 'swapVoice').mockRejectedValue(
      new Error('API quota exceeded')
    );

    // We manually set originalVoiceoverKey to original WAV and voiceoverSource to generating, simulating a failed job
    await env.DB.prepare(`
      UPDATE step_audio SET
        voiceoverSource = 'generating',
        originalVoiceoverKey = 'audio/sessions/session-test-123/steps/step-0/orig.wav',
        jobId = 'failed-job-id',
        jobStartedAt = ?
      WHERE stepId = ? AND sessionId = ?
    `).bind(Date.now(), stepId, sessionId).run();

    // Run queue worker with attempts = 4 (simulating terminal retry exhaustion)
    const queueMsg = {
      type: 'audio_swap',
      sessionId,
      stepId,
      voiceId: '2EiwWnXF2V4jofwvRnss',
      userId,
      workspaceId,
      jobId: 'failed-job-id',
    };

    const batch = {
      messages: [
        {
          id: 'msg-failed',
          body: queueMsg,
          attempts: 4, // Terminal failure trigger!
          ack: vi.fn(),
          retry: vi.fn(),
        }
      ]
    };

    const ctx = createExecutionContext();
    await handleQueue(batch as any, env, ctx);

    // 1. Verify swapVoice was called and failed
    expect(swapSpy).toHaveBeenCalled();

    // 2. Verify creditsBalance is refunded (10 credits again)
    const user = await env.DB.prepare('SELECT creditsBalance FROM users WHERE id = ?').bind(userId).first() as any;
    expect(user.creditsBalance).toBe(11); // starts at 10, queue worker adds 1. (Wait, let's verify if user record starts at 10. Yes, in beforeEach we reset it to 10.)

    // 3. Verify ledger has refund entry
    const ledger = await env.DB.prepare('SELECT * FROM credits_ledger WHERE userId = ? AND delta = 1').bind(userId).first() as any;
    expect(ledger).toBeDefined();
    expect(ledger.reason).toBe('audio_swap_refund');

    // 4. Verify step_audio state rolled back to original
    const audio = await env.DB.prepare('SELECT * FROM step_audio WHERE stepId = ? AND sessionId = ?')
      .bind(stepId, sessionId).first() as any;
    expect(audio.voiceoverSource).toBe('original');
    expect(audio.voiceoverKey).toBe('audio/sessions/session-test-123/steps/step-0/orig.wav');
    expect(audio.originalVoiceoverKey).toBeNull();
    expect(audio.jobId).toBeNull();

    // 5. Verify message was acknowledged (since it's a terminal failure cleanup)
    expect(batch.messages[0].ack).toHaveBeenCalled();
  });

  it('recovers stuck swap jobs via GET /audio-status, resetting state and refunding credits', async () => {
    // 1. Seed user with 9 credits (simulating swap deduction occurred)
    await env.DB.prepare('UPDATE users SET creditsBalance = 9 WHERE id = ?').bind(userId).run();

    // 2. Set step state to generating, with a swapVoiceId and originalVoiceoverKey, and a jobStartedAt 6 minutes ago
    const sixMinutesAgo = Date.now() - 6 * 60 * 1000;
    await env.DB.prepare(`
      UPDATE step_audio SET
        voiceoverSource = 'generating',
        originalVoiceoverKey = 'audio/sessions/session-test-123/steps/step-0/orig.wav',
        swapVoiceId = '2EiwWnXF2V4jofwvRnss',
        jobId = 'stuck-job-id',
        jobStartedAt = ?
      WHERE stepId = ? AND sessionId = ?
    `).bind(sixMinutesAgo, stepId, sessionId).run();

    // 3. Make GET request to /audio-status
    const request = new Request(
      `http://localhost/v1/sessions/${sessionId}/steps/${stepId}/audio-status?workspaceId=${workspaceId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'x-workspace-id': workspaceId,
        },
      }
    );

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.voiceoverSource).toBe('original');
    expect(body.voiceoverKey).toBe('audio/sessions/session-test-123/steps/step-0/orig.wav');
    expect(body.swapVoiceId).toBeNull();
    expect(body.originalVoiceoverKey).toBeNull();

    // 4. Verify creditsBalance is now 10 (refunded by 1)
    const user = await env.DB.prepare('SELECT creditsBalance FROM users WHERE id = ?').bind(userId).first() as any;
    expect(user.creditsBalance).toBe(10);

    // 5. Verify ledger has audit entry
    const ledger = await env.DB.prepare('SELECT * FROM credits_ledger WHERE userId = ? AND reason = ?').bind(userId, 'audio_swap_refund_ttl').first() as any;
    expect(ledger).toBeDefined();
    expect(ledger.delta).toBe(1);

    // 6. Verify database step state is reset
    const audio = await env.DB.prepare('SELECT * FROM step_audio WHERE stepId = ? AND sessionId = ?')
      .bind(stepId, sessionId).first() as any;
    expect(audio.voiceoverSource).toBe('original');
    expect(audio.voiceoverKey).toBe('audio/sessions/session-test-123/steps/step-0/orig.wav');
    expect(audio.originalVoiceoverKey).toBeNull();
    expect(audio.swapVoiceId).toBeNull();
    expect(audio.jobId).toBeNull();
    expect(audio.jobStartedAt).toBeNull();
  });
});
