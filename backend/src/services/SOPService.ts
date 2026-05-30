import { StepSchema, type Step } from '../../../shared/types/step';

export type SOPStatus = 'draft' | 'review' | 'published';

export interface SOPRow {
  id: string;
  workspaceId: string;
  sessionId: string;
  title: string;
  status: SOPStatus;
  schemaVersion: string; // D1 has TEXT, default '1.0'
  createdAt: number;     // D1 has INTEGER
  updatedAt: number;     // D1 has INTEGER
}

export interface StepRow {
  id: string;
  sopId: string;
  workspaceId: string;
  stepIndex: number;    // D1 has stepIndex
  type: string;
  content: string;      // JSON string — parse with StepSchema
  version: number;
  createdAt: number;    // D1 has INTEGER
  updatedAt: number;    // D1 has INTEGER
}

export class SOPService {
  constructor(private db: D1Database) {}

  async getSOPById(sopId: string, workspaceId: string): Promise<SOPRow | null> {
    const row = await this.db
      .prepare('SELECT * FROM sops WHERE id = ? AND workspaceId = ?')
      .bind(sopId, workspaceId)
      .first<SOPRow>();
    return row ?? null;
  }

  async listSOPs(workspaceId: string): Promise<SOPRow[]> {
    const result = await this.db
      .prepare('SELECT * FROM sops WHERE workspaceId = ? ORDER BY updatedAt DESC')
      .bind(workspaceId)
      .all<SOPRow>();
    return result.results;
  }

  async createSOP(params: {
    id: string;
    workspaceId: string;
    sessionId: string;
    title: string;
  }): Promise<SOPRow> {
    const now = Date.now();
    await this.db
      .prepare(`INSERT INTO sops (id, workspaceId, sessionId, title, status, schemaVersion, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, 'draft', '1.0', ?, ?)`)
      .bind(params.id, params.workspaceId, params.sessionId, params.title, now, now)
      .run();
    return (await this.getSOPById(params.id, params.workspaceId))!;
  }

  async transitionStatus(
    sopId: string,
    workspaceId: string,
    targetStatus: SOPStatus,
    actorId: string,
  ): Promise<SOPRow> {
    const sop = await this.getSOPById(sopId, workspaceId);
    if (!sop) throw new Error('SOP not found');

    const allowed: Record<SOPStatus, SOPStatus[]> = {
      draft: ['review'],
      review: ['published', 'draft'],
      published: [],
    };

    if (!allowed[sop.status].includes(targetStatus)) {
      throw new Error(`Cannot transition from ${sop.status} to ${targetStatus}`);
    }

    const now = Date.now();
    await this.db
      .prepare('UPDATE sops SET status = ?, updatedAt = ? WHERE id = ? AND workspaceId = ?')
      .bind(targetStatus, now, sopId, workspaceId)
      .run();

    return (await this.getSOPById(sopId, workspaceId))!;
  }

  async getSteps(sopId: string, workspaceId: string): Promise<Step[]> {
    const result = await this.db
      .prepare('SELECT * FROM steps WHERE sopId = ? AND workspaceId = ? ORDER BY stepIndex ASC')
      .bind(sopId, workspaceId)
      .all<StepRow>();

    return result.results.map(row => {
      const parsed = StepSchema.safeParse(JSON.parse(row.content));
      if (!parsed.success) {
        console.error(`[SOPService] Step ${row.id} failed schema validation`, parsed.error);
        // Use row.id as canonical — content id may be stale after a fork
        return { ...JSON.parse(row.content) as Step, id: row.id };
      }
      // row.id is the authoritative DB key; override content's id to keep them in sync
      return { ...parsed.data, id: row.id };
    });
  }

  async updateStep(
    stepId: string,
    sopId: string,
    workspaceId: string,
    updates: Partial<Step>,
    actorId: string,
  ): Promise<void> {
    const sop = await this.getSOPById(sopId, workspaceId);
    if (!sop) throw new Error('SOP not found');

    const existing = await this.db
      .prepare('SELECT * FROM steps WHERE id = ? AND sopId = ? AND workspaceId = ?')
      .bind(stepId, sopId, workspaceId)
      .first<StepRow>();
    if (!existing) throw new Error('Step not found');

    const currentContent: Step = JSON.parse(existing.content);
    const newContent: Step = { ...currentContent, ...updates };

    // Validate before writing
    const validated = StepSchema.safeParse(newContent);
    if (!validated.success) {
      throw new Error(`Step update failed schema validation: ${validated.error.message}`);
    }

    const now = Date.now();
    await this.db
      .prepare(`UPDATE steps SET content = ?, version = version + 1, updatedAt = ?
                WHERE id = ? AND sopId = ? AND workspaceId = ?`)
      .bind(JSON.stringify(validated.data), now, stepId, sopId, workspaceId)
      .run();
  }

  async forkToNewDraft(sopId: string, workspaceId: string, actorId: string): Promise<SOPRow> {
    const source = await this.getSOPById(sopId, workspaceId);
    if (!source) throw new Error('Source SOP not found');
    if (source.status !== 'published') throw new Error('Can only fork a published SOP');

    const newId = crypto.randomUUID();
    const newSop = await this.createSOP({
      id: newId,
      workspaceId,
      sessionId: source.sessionId,
      title: `${source.title} (Draft)`,
    });

    // Copy all steps to the new SOP
    const sourceSteps = await this.db
      .prepare('SELECT * FROM steps WHERE sopId = ? AND workspaceId = ? ORDER BY stepIndex ASC')
      .bind(sopId, workspaceId)
      .all<StepRow>();

    const now = Date.now();
    for (const step of sourceSteps.results) {
      const newStepId = crypto.randomUUID();
      // Keep content.id in sync with the row id so updateStep lookups work correctly.
      const contentObj = JSON.parse(step.content);
      contentObj.id = newStepId;
      const newContent = JSON.stringify(contentObj);
      await this.db
        .prepare(`INSERT INTO steps (id, sopId, workspaceId, stepIndex, type, content, version, createdAt, updatedAt)
                  VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`)
        .bind(newStepId, newId, workspaceId, step.stepIndex, step.type, newContent, now, now)
        .run();
    }

    return newSop;
  }
}
