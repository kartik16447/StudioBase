import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../../middlewares/auth';
import { workspaceMiddleware, requireRole } from '../../middlewares/workspace';
import { 
  TriggerPipelineSchema, 
  TopupCreditsSchema 
} from '../../schemas/pipeline';
import { HTTPException } from 'hono/http-exception';

const pipeline = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply workspace middleware globally
pipeline.use('*', authMiddleware(), workspaceMiddleware());

// 1. Get Credits Balance
pipeline.get('/credits', async (c) => {
  const user = c.get('user');
  const record = await c.env.DB.prepare(
    'SELECT creditsBalance FROM users WHERE id = ?'
  ).bind(user.id).first() as any;
  
  return c.json({ balance: record?.creditsBalance || 0 });
});

// 2. Topup Credits
pipeline.post('/credits/topup', zValidator('json', TopupCreditsSchema), async (c) => {
  const user = c.get('user');
  const { amount } = c.req.valid('json');
  
  // TODO: Verify payment with Stripe
  
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET creditsBalance = creditsBalance + ? WHERE id = ?')
      .bind(amount, user.id),
    c.env.DB.prepare('INSERT INTO credits_ledger (id, userId, delta, reason, createdAt) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), user.id, amount, 'topup', now),
  ]);

  const updated = await c.env.DB.prepare('SELECT creditsBalance FROM users WHERE id = ?')
    .bind(user.id).first() as any;
    
  return c.json({ balance: updated?.creditsBalance || 0 });
});

// 3. Trigger Pipeline
pipeline.post('/trigger', requireRole('Member'), zValidator('json', TriggerPipelineSchema), async (c) => {
  const user = c.get('user');
  const ws = c.get('workspace');
  const { sessionId, requestedOutputs } = c.req.valid('json');

  // Ensure session belongs to the workspace
  const session = await c.env.DB.prepare(
    'SELECT * FROM sessions WHERE id = ? AND workspaceId = ? AND deletedAt IS NULL'
  ).bind(sessionId, ws.id).first() as any;
  
  if (!session) throw new HTTPException(404, { message: 'Session not found in this workspace' });

  const creditCost =
    (requestedOutputs.sop ? 1 : 0) +
    (requestedOutputs.demo ? 1 : 0) +
    (requestedOutputs.video ? 2 : 0);

  const userRecord = await c.env.DB.prepare('SELECT creditsBalance FROM users WHERE id = ?')
    .bind(user.id).first() as any;
    
  if ((userRecord?.creditsBalance || 0) < creditCost) {
    await c.env.DB.prepare('UPDATE sessions SET status = ? WHERE id = ?')
      .bind('credit_exhausted', sessionId)
      .run();
    throw new HTTPException(402, { message: `Need ${creditCost} credits, have ${userRecord?.creditsBalance || 0}` });
  }

  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET creditsBalance = creditsBalance - ? WHERE id = ?')
      .bind(creditCost, user.id),
    c.env.DB.prepare('INSERT INTO credits_ledger (id, userId, delta, reason, workspaceId, sessionId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), user.id, -creditCost, 'generation', ws.id, sessionId, now),
    c.env.DB.prepare('UPDATE sessions SET status = ?, updatedAt = ? WHERE id = ?')
      .bind('processing', now, sessionId),
  ]);

  await c.env.PIPELINE_QUEUE.send({ 
    sessionId, 
    userId: user.id, 
    workspaceId: ws.id,
    r2JsonKey: session.r2JsonKey, 
    requestedOutputs 
  });

  return c.json({ success: true, creditCost, queuedAt: now });
});

export default pipeline;
