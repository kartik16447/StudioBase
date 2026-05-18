import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { Env, Variables } from '../../types/hono';
import { authMiddleware } from '../../middlewares/auth';
import { workspaceMiddleware } from '../../middlewares/workspace';
import { CommentService } from '../../services/CommentService';
import { NotificationService } from '../../services/NotificationService';
import { AuditService } from '../../services/AuditService';

const comments = new Hono<{ Bindings: Env; Variables: Variables }>();

comments.use('*', authMiddleware(), workspaceMiddleware());

const CreateCommentSchema = z.object({
  sopId: z.string().min(1),
  stepId: z.string().optional().nullable(),
  body: z.string().min(1).max(2000),
});

// GET /v1/comments?sopId=<id>
comments.get('/', async (c) => {
  const sopId = c.req.query('sopId');
  if (!sopId) return c.json({ error: 'sopId query param required' }, 400);

  const ws = c.get('workspace');
  const service = new CommentService(c.env.DB);
  const list = await service.listBySop(sopId, ws.id);
  return c.json({ comments: list });
});

// POST /v1/comments
comments.post('/', zValidator('json', CreateCommentSchema), async (c) => {
  const ws = c.get('workspace');
  const user = c.get('user');
  const { sopId, stepId, body } = c.req.valid('json');

  const commentSvc = new CommentService(c.env.DB);
  const notifSvc = new NotificationService(c.env.DB);

  const comment = await commentSvc.create({
    id: crypto.randomUUID(),
    workspaceId: ws.id,
    sopId,
    stepId: stepId ?? null,
    authorId: user.id,
    body,
  });

  // Fan-out: notify SOP author + previous commenters (excluding self)
  const [sopOwner, prevCommenters] = await Promise.all([
    notifSvc.getSopOwner(sopId),
    commentSvc.getCommentersOnSop(sopId, user.id),
  ]);

  const recipients = [...new Set([
    ...(sopOwner && sopOwner !== user.id ? [sopOwner] : []),
    ...prevCommenters,
  ])];

  if (recipients.length > 0) {
    await notifSvc.fanOut(recipients, {
      workspaceId: ws.id,
      type: 'comment.added',
      actorId: user.id,
      targetId: sopId,
      metadata: {
        sopId,
        commentId: comment.id,
        stepId: stepId ?? null,
        commentBody: body.slice(0, 120),
        actorName: user.name ?? user.email,
      },
    });
  }

  AuditService.record(c.env, {
    actorId: user.id,
    workspaceId: ws.id,
    event: 'comment.created',
    metadata: { sopId, commentId: comment.id, stepId: stepId ?? null },
  }).catch(() => {});

  return c.json(comment, 201);
});

// PATCH /v1/comments/:id/resolve  (toggle resolved/unresolved)
comments.patch('/:id/resolve', async (c) => {
  const ws = c.get('workspace');
  const user = c.get('user');
  const commentId = c.req.param('id');

  const service = new CommentService(c.env.DB);
  const updated = await service.resolve(commentId, ws.id, user.id);
  if (!updated) return c.json({ error: 'Comment not found' }, 404);

  return c.json(updated);
});

// DELETE /v1/comments/:id
comments.delete('/:id', async (c) => {
  const ws = c.get('workspace');
  const user = c.get('user');
  const commentId = c.req.param('id');
  const role = c.get('workspace').role ?? 'Member';

  const service = new CommentService(c.env.DB);
  const ok = await service.softDelete(commentId, ws.id, user.id, role);
  if (!ok) return c.json({ error: 'Not found or not authorized' }, 403);

  return c.json({ ok: true });
});

export { comments };
