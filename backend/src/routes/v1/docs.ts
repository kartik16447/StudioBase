import { Hono } from 'hono';
import { z } from 'zod';
import { DocumentService } from '../../services/DocumentService';
import { AuditService } from '../../services/AuditService';
import { requireWorkspaceMembership } from '../../middlewares/auth';
import { Env } from '../../types/hono';

const docs = new Hono<{ Bindings: Env }>();

// List templates
docs.get('/templates', requireWorkspaceMembership('viewer'), async (c) => {
  const workspaceId = c.get('workspace').id;
  const service = new DocumentService(c.env.DB);
  const results = await service.listTemplates(workspaceId);
  return c.json(results);
});

// List all documents (summaries, no blocks) for workspace
docs.get('/', requireWorkspaceMembership('viewer'), async (c) => {
  const workspaceId = c.get('workspace').id;
  const service = new DocumentService(c.env.DB);
  const results = await service.listByWorkspace(workspaceId);
  return c.json(results);
});

// Full-text search
docs.get('/search', requireWorkspaceMembership('viewer'), async (c) => {
  const workspaceId = c.get('workspace').id;
  const q = c.req.query('q')?.trim();
  if (!q || q.length < 2) return c.json([]);
  const service = new DocumentService(c.env.DB);
  const hits = await service.search(workspaceId, q);
  return c.json(hits);
});

// Get a single document with blocks
docs.get('/:docId', requireWorkspaceMembership('viewer'), async (c) => {
  const { docId } = c.req.param();
  const workspaceId = c.get('workspace').id;
  const service = new DocumentService(c.env.DB);
  const doc = await service.getById(docId, workspaceId);
  if (!doc) return c.json({ error: 'Not found' }, 404);
  return c.json({ ...doc, blocks: JSON.parse(doc.blocks) });
});

// Create a document
const CreateDocBody = z.object({
  title: z.string().max(500).default(''),
  emoji: z.string().max(8).nullable().default(null),
  blocks: z.array(z.any()).default([]),
  parentId: z.string().nullable().default(null),
  sourceSopId: z.string().nullable().optional(),
});

docs.post('/', requireWorkspaceMembership('editor'), async (c) => {
  const workspaceId = c.get('workspace').id;
  const user = c.get('user');
  const body = await c.req.json();
  const parsed = CreateDocBody.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const service = new DocumentService(c.env.DB);
  const sortOrder = await service.nextSortOrder(workspaceId, parsed.data.parentId);
  const doc = await service.create({
    id: crypto.randomUUID(),
    workspaceId,
    parentId: parsed.data.parentId,
    title: parsed.data.title,
    emoji: parsed.data.emoji,
    blocks: parsed.data.blocks,
    sortOrder,
    userId: user.id,
    sourceSopId: parsed.data.sourceSopId ?? null,
  });

  AuditService.record(c.env, {
    actorId: user.id,
    workspaceId,
    event: 'doc.created',
    metadata: { docId: doc.id, title: doc.title },
  }).catch(() => {});

  return c.json({ ...doc, blocks: JSON.parse(doc.blocks) }, 201);
});

// Update a document (title, emoji, blocks, parentId, sortOrder)
const UpdateDocBody = z.object({
  title: z.string().max(500).optional(),
  emoji: z.string().max(8).nullable().optional(),
  blocks: z.array(z.any()).optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
});

docs.patch('/:docId', requireWorkspaceMembership('editor'), async (c) => {
  const { docId } = c.req.param();
  const workspaceId = c.get('workspace').id;
  const user = c.get('user');
  const body = await c.req.json();
  const parsed = UpdateDocBody.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const service = new DocumentService(c.env.DB);
  let doc;
  try {
    doc = await service.update(docId, workspaceId, user.id, parsed.data);
  } catch (err: any) {
    return c.json({ error: err.message }, 404);
  }

  AuditService.record(c.env, {
    actorId: user.id,
    workspaceId,
    event: 'doc.updated',
    metadata: { docId, fields: Object.keys(parsed.data) },
  }).catch(() => {});

  return c.json({ ...doc, blocks: JSON.parse(doc.blocks) });
});

// Delete a document (and all its children recursively)
docs.delete('/:docId', requireWorkspaceMembership('editor'), async (c) => {
  const { docId } = c.req.param();
  const workspaceId = c.get('workspace').id;
  const user = c.get('user');

  const service = new DocumentService(c.env.DB);
  const doc = await service.getById(docId, workspaceId);
  if (!doc) return c.json({ error: 'Not found' }, 404);

  await service.delete(docId, workspaceId);

  AuditService.record(c.env, {
    actorId: user.id,
    workspaceId,
    event: 'doc.deleted',
    metadata: { docId, title: doc.title },
  }).catch(() => {});

  return c.json({ ok: true });
});

// Generate a public share link for a document
docs.post('/:docId/share', requireWorkspaceMembership('editor'), async (c) => {
  const { docId } = c.req.param();
  const workspaceId = c.get('workspace').id;
  const service = new DocumentService(c.env.DB);
  let token: string;
  try {
    token = await service.generateShareToken(docId, workspaceId);
  } catch (err: any) {
    return c.json({ error: err.message }, 404);
  }
  const origin = new URL(c.req.url).origin;
  return c.json({ shareToken: token, shareUrl: `${origin}/share/docs/${token}` });
});

// Save a document as a template
docs.post('/:docId/save-as-template', requireWorkspaceMembership('editor'), async (c) => {
  const { docId } = c.req.param();
  const workspaceId = c.get('workspace').id;
  const service = new DocumentService(c.env.DB);
  const doc = await service.getById(docId, workspaceId);
  if (!doc) return c.json({ error: 'Not found' }, 404);
  await service.saveAsTemplate(docId, workspaceId);
  return c.json({ ok: true });
});

// Create a new document from a template
docs.post('/from-template/:templateId', requireWorkspaceMembership('editor'), async (c) => {
  const { templateId } = c.req.param();
  const workspaceId = c.get('workspace').id;
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const parentId = typeof body.parentId === 'string' ? body.parentId : null;

  const service = new DocumentService(c.env.DB);
  let doc;
  try {
    doc = await service.createFromTemplate({ templateId, workspaceId, parentId, userId: user.id });
  } catch (err: any) {
    return c.json({ error: err.message }, 404);
  }
  return c.json({ ...doc, blocks: JSON.parse(doc.blocks) }, 201);
});

export { docs };
