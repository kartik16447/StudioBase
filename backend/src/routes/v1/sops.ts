import { Hono } from 'hono';
import { z } from 'zod';
import { SOPService } from '../../services/SOPService';
import { AuditService } from '../../services/AuditService';
import { NotificationService } from '../../services/NotificationService';
import { requireWorkspaceMembership } from '../../middlewares/auth';
import { Env } from '../../types/hono';

const sops = new Hono<{ Bindings: Env }>();

// List SOPs for workspace
sops.get('/', requireWorkspaceMembership('viewer'), async (c) => {
  const workspaceId = c.get('workspace').id;
  const service = new SOPService(c.env.DB);
  const results = await service.listSOPs(workspaceId);
  return c.json(results);
});

// Get single SOP with steps
sops.get('/:sopId', requireWorkspaceMembership('viewer'), async (c) => {
  const { sopId } = c.req.param();
  const workspaceId = c.get('workspace').id;
  const service = new SOPService(c.env.DB);

  const sop = await service.getSOPById(sopId, workspaceId);
  if (!sop) return c.json({ error: 'Not found' }, 404);

  const steps = await service.getSteps(sopId, workspaceId);
  return c.json({ ...sop, steps });
});

// Update a step's text override (editor action)
const UpdateStepBody = z.object({
  textOverride: z.string().max(2000).optional(),
  annotations: z.array(z.any()).optional(),
  cards: z.array(z.any()).optional(),
  overlays: z.array(z.any()).optional(),
  stepTitle: z.string().max(300).nullable().optional(),
  locked: z.boolean().optional(),
});

sops.patch('/:sopId/steps/:stepId', requireWorkspaceMembership('editor'), async (c) => {
  const { sopId, stepId } = c.req.param();
  const workspaceId = c.get('workspace').id;
  const user = c.get('user');
  const actorId = user.id;

  const body = await c.req.json();
  const parsed = UpdateStepBody.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const service = new SOPService(c.env.DB);
  try {
    await service.updateStep(stepId, sopId, workspaceId, parsed.data, actorId);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }

  AuditService.record(c.env, {
    actorId,
    workspaceId,
    event: 'step_updated',
    metadata: { sopId, stepId },
  }).catch(() => {});

  if ('textOverride' in parsed.data || 'generatedText' in parsed.data) {
    AuditService.record(c.env, {
      actorId,
      workspaceId,
      event: 'step_narration_edited',
      metadata: { sopId, stepId },
    }).catch(() => {});
  }

  return c.json({ ok: true });
});

// Transition SOP status
const TransitionBody = z.object({
  status: z.enum(['review', 'published', 'draft']),
});

sops.post('/:sopId/status', requireWorkspaceMembership('editor'), async (c) => {
  const { sopId } = c.req.param();
  const workspaceId = c.get('workspace').id;
  const user = c.get('user');
  const actorId = user.id;

  const body = await c.req.json();
  const parsed = TransitionBody.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const service = new SOPService(c.env.DB);
  const before = await service.getSOPById(sopId, workspaceId);
  if (!before) return c.json({ error: 'SOP not found' }, 404);
  const previousStatus = before.status;
  let updated;
  try {
    updated = await service.transitionStatus(sopId, workspaceId, parsed.data.status, actorId);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }

  AuditService.record(c.env, {
    actorId,
    workspaceId,
    event: `sop.status.${parsed.data.status}`,
    metadata: { sopId, previousStatus, newStatus: updated.status },
  }).catch(() => {});

  // Fan-out notifications on meaningful transitions
  const notifSvc = new NotificationService(c.env.DB);
  const sopTitle = updated.title ?? 'Untitled SOP';
  if (parsed.data.status === 'review') {
    // Notify workspace admins/owners that review is requested
    const admins = await notifSvc.getWorkspaceAdmins(workspaceId, actorId);
    if (admins.length > 0) {
      await notifSvc.fanOut(admins, {
        workspaceId,
        type: 'sop.review_requested',
        actorId,
        targetId: sopId,
        metadata: { sopId, sopTitle, actorName: user.name ?? user.email },
      }).catch(() => {});
    }
  } else if (parsed.data.status === 'published') {
    // Notify the SOP's session owner that it's published
    const owner = await notifSvc.getSopOwner(sopId);
    if (owner && owner !== actorId) {
      await notifSvc.create({
        id: crypto.randomUUID(),
        userId: owner,
        workspaceId,
        type: 'sop.published',
        actorId,
        targetId: sopId,
        metadata: { sopId, sopTitle, actorName: user.name ?? user.email },
      }).catch(() => {});
    }
  }

  return c.json(updated);
});

// Fork a published SOP to a new draft
sops.post('/:sopId/fork', requireWorkspaceMembership('editor'), async (c) => {
  const { sopId } = c.req.param();
  const workspaceId = c.get('workspace').id;
  const user = c.get('user');
  const actorId = user.id;

  const service = new SOPService(c.env.DB);
  const newSop = await service.forkToNewDraft(sopId, workspaceId, actorId);

  AuditService.record(c.env, {
    actorId,
    workspaceId,
    event: 'sop.forked',
    metadata: { sourceSopId: sopId, newSopId: newSop.id },
  }).catch(() => {});

  return c.json(newSop, 201);
});

export { sops };
