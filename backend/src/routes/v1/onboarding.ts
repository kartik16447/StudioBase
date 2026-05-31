import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { authMiddleware } from '../../middlewares/auth';
import { workspaceMiddleware } from '../../middlewares/workspace';

const onboarding = new Hono<{ Bindings: Env; Variables: Variables }>();

onboarding.use('*', authMiddleware(), workspaceMiddleware());

// GET /v1/onboarding/state
onboarding.get('/state', async (c) => {
  const user = c.get('user');
  const workspaceId = user.workspaceId;

  const row = await c.env.DB.prepare(
    'SELECT onboardingType, completedFirstRecording, skippedOnboarding, seededSessionId, sopToDocPromptSeen FROM onboarding_state WHERE userId = ? AND workspaceId = ?'
  ).bind(user.id, workspaceId).first() as any;

  if (!row) {
    return c.json({
      onboardingType: 'creator',
      completedFirstRecording: 0,
      skippedOnboarding: 0,
      seededSessionId: null,
      sopToDocPromptSeen: false,
    });
  }

  return c.json({
    onboardingType: row.onboardingType,
    completedFirstRecording: row.completedFirstRecording,
    skippedOnboarding: row.skippedOnboarding,
    seededSessionId: row.seededSessionId ?? null,
    sopToDocPromptSeen: row.sopToDocPromptSeen === 1,
  });
});

// PATCH /v1/onboarding/state
onboarding.patch('/state', async (c) => {
  const user = c.get('user');
  const workspaceId = user.workspaceId;
  const body = await c.req.json().catch(() => ({})) as any;

  const fields: string[] = [];
  const values: any[] = [];

  if (typeof body.skippedOnboarding === 'boolean') {
    fields.push('skippedOnboarding = ?');
    values.push(body.skippedOnboarding ? 1 : 0);
  }
  if (typeof body.completedFirstRecording === 'boolean') {
    fields.push('completedFirstRecording = ?');
    values.push(body.completedFirstRecording ? 1 : 0);
  }
  if (typeof body.sopToDocPromptSeen === 'boolean') {
    fields.push('sopToDocPromptSeen = ?');
    values.push(body.sopToDocPromptSeen ? 1 : 0);
  }

  if (fields.length > 0) {
    values.push(user.id, workspaceId);
    await c.env.DB.prepare(
      `UPDATE onboarding_state SET ${fields.join(', ')} WHERE userId = ? AND workspaceId = ?`
    ).bind(...values).run();
  }

  return c.json({ ok: true });
});

export default onboarding;
