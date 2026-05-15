

export interface RecoveryResult {
  status: 'success' | 'failure';
  repairedSessions: number;
  createdUsers: number;
  createdWorkspaces: number;
  logs: string[];
}

export async function runLocalRecovery(db: any, adminEmail: string): Promise<RecoveryResult> {
  const logs: string[] = [];
  const result: RecoveryResult = {
    status: 'success',
    repairedSessions: 0,
    createdUsers: 0,
    createdWorkspaces: 0,
    logs
  };

  try {
    logs.push(`[Recovery] Starting recovery for admin: ${adminEmail}`);

    // 1. Ensure Admin User exists
    const user = await db.prepare('SELECT id FROM users WHERE email = ?').bind(adminEmail).first();
    let userId = user?.id;

    if (!userId) {
      userId = `user_${crypto.randomUUID().substring(0, 8)}`;
      await db.prepare('INSERT INTO users (id, email, name, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)')
        .bind(userId, adminEmail, 'Local Admin', Date.now(), Date.now())
        .run();
      logs.push(`[Recovery] Created missing admin user: ${userId}`);
      result.createdUsers++;
    } else {
      logs.push(`[Recovery] Found existing admin user: ${userId}`);
    }

    // 2. Ensure a Workspace exists for this user
    let workspace = await db.prepare('SELECT id FROM workspaces WHERE ownerId = ? LIMIT 1').bind(userId).first();
    let workspaceId = workspace?.id;

    if (!workspaceId) {
      workspaceId = `ws_${crypto.randomUUID().substring(0, 8)}`;
      await db.prepare('INSERT INTO workspaces (id, name, slug, ownerId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(workspaceId, 'Local Workspace', 'local-ws', userId, Date.now(), Date.now())
        .run();
      logs.push(`[Recovery] Created missing workspace: ${workspaceId}`);
      result.createdWorkspaces++;
    } else {
      logs.push(`[Recovery] Found existing workspace: ${workspaceId}`);
    }

    // 3. Ensure Membership exists
    const membership = await db.prepare('SELECT role FROM workspace_members WHERE userId = ? AND workspaceId = ?')
      .bind(userId, workspaceId)
      .first();
    
    if (!membership) {
      await db.prepare('INSERT INTO workspace_members (userId, workspaceId, role, joinedAt) VALUES (?, ?, ?, ?)')
        .bind(userId, workspaceId, 'Owner', Date.now())
        .run();
      logs.push(`[Recovery] Created missing workspace membership for user ${userId} in ${workspaceId}`);
    }

    // 4. Repair Legacy Sessions
    // Detect sessions with missing workspaceId or ownerId (though schema has NOT NULL, they might be pointing to deleted records or dummy IDs)
    // We'll also check for any session where the owner doesn't exist
    const sessions = await db.prepare('SELECT id, ownerId, workspaceId FROM sessions').all();
    
    for (const session of sessions.results) {
      let needsRepair = false;
      
      // Check if owner exists
      const ownerExists = await db.prepare('SELECT id FROM users WHERE id = ?').bind(session.ownerId).first();
      if (!ownerExists) {
        logs.push(`[Recovery] Session ${session.id} has non-existent owner ${session.ownerId}. Re-assigning to admin.`);
        needsRepair = true;
      }

      // Check if workspace exists
      const wsExists = await db.prepare('SELECT id FROM workspaces WHERE id = ?').bind(session.workspaceId).first();
      if (!wsExists) {
        logs.push(`[Recovery] Session ${session.id} has non-existent workspace ${session.workspaceId}. Re-assigning to local workspace.`);
        needsRepair = true;
      }

      if (needsRepair) {
        await db.prepare('UPDATE sessions SET ownerId = ?, workspaceId = ?, updatedAt = ? WHERE id = ?')
          .bind(userId, workspaceId, Date.now(), session.id)
          .run();
        result.repairedSessions++;
      }
    }

    logs.push(`[Recovery] Repair complete. Total sessions scanned: ${sessions.results.length}`);
    return result;

  } catch (err: any) {
    logs.push(`[Recovery] FATAL ERROR: ${err.message}`);
    result.status = 'failure';
    return result;
  }
}
