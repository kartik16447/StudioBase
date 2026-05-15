import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { authMiddleware } from '../../middlewares/auth';
import { workspaceMiddleware } from '../../middlewares/workspace';
import { HTTPException } from 'hono/http-exception';
import { PipelineService } from '../../services/PipelineService';

const pipeline = new Hono<{ Bindings: Env; Variables: Variables }>();

// 1. Trigger Pipeline (Requires Workspace Context)
pipeline.post('/trigger', authMiddleware(), workspaceMiddleware(), async (c) => {
  const user = c.get('user');
  const ws = c.get('workspace');
  const { sessionId, requestedOutputs } = await c.req.json();

  if (!sessionId) throw new HTTPException(400, { message: 'sessionId required' });

  const service = new PipelineService(c.env, c.executionCtx);
  try {
    const result = await service.trigger(user.id, sessionId, requestedOutputs);
    return c.json({ success: true, ...result });
  } catch (err: any) {
    if (err.message === 'NOT_FOUND') throw new HTTPException(404, { message: 'Session not found' });
    if (err.message === 'NO_OUTPUTS') throw new HTTPException(400, { message: 'Select at least one output' });
    if (err.message.startsWith('INSUFFICIENT_CREDITS:')) {
      const [_, cost, balance] = err.message.split(':');
      throw new HTTPException(402, { message: `Need ${cost} credits, have ${balance}` });
    }
    throw err;
  }
});

export default pipeline;
