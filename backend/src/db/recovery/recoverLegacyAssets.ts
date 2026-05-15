import { D1Database, R2Bucket } from '@cloudflare/workers-types';

export interface RecoveryStats {
  scanned: number;
  recoveredSessions: number;
  orphanedAssets: number;
  skipped: number;
  usersCreated: number;
  workspacesCreated: number;
  allKeys?: string[];
  logs: string[];
}

export async function runLegacyRecovery(
  db: D1Database,
  r2: R2Bucket,
  targetEmail: string,
  dryRun: boolean = true
): Promise<RecoveryStats> {
  const stats: RecoveryStats = {
    scanned: 0,
    recoveredSessions: 0,
    orphanedAssets: 0,
    skipped: 0,
    usersCreated: 0,
    workspacesCreated: 0,
    allKeys: [],
    logs: []
  };

  const log = (msg: string) => {
    console.log(`[RECOVERY] ${msg}`);
    stats.logs.push(msg);
  };

  log(`Starting legacy recovery for ${targetEmail} (Dry Run: ${dryRun})`);

  // 1. Ensure User & Workspace
  let user = await db.prepare('SELECT id FROM users WHERE email = ?').bind(targetEmail).first<{ id: string }>();
  let userId: string;

  if (!user) {
    if (dryRun) {
      userId = 'dry-run-user-id';
      log(`[DRY RUN] Would create user for ${targetEmail}`);
    } else {
      userId = crypto.randomUUID();
      const now = Date.now();
      await db.prepare('INSERT INTO users (id, email, name, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)')
        .bind(userId, targetEmail, targetEmail.split('@')[0], now, now)
        .run();
      stats.usersCreated++;
      log(`Created user ${userId} for ${targetEmail}`);
    }
  } else {
    userId = user.id;
    log(`Using existing user ${userId}`);
  }

  let workspace = await db.prepare('SELECT id FROM workspaces WHERE ownerId = ?').bind(userId).first<{ id: string }>();
  let workspaceId: string;

  if (!workspace) {
    if (dryRun) {
      workspaceId = 'dry-run-ws-id';
      log(`[DRY RUN] Would create workspace for ${userId}`);
    } else {
      workspaceId = crypto.randomUUID();
      const now = Date.now();
      const slug = `workspace-${userId.slice(0, 8)}`;
      await db.prepare('INSERT INTO workspaces (id, name, slug, ownerId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(workspaceId, 'My Workspace', slug, userId, now, now)
        .run();
      
      await db.prepare('INSERT INTO workspace_members (userId, workspaceId, role, joinedAt) VALUES (?, ?, ?, ?)')
        .bind(userId, workspaceId, 'Owner', now)
        .run();

      stats.workspacesCreated++;
      log(`Created workspace ${workspaceId} for ${userId}`);
    }
  } else {
    workspaceId = workspace.id;
    log(`Using existing workspace ${workspaceId}`);
  }

  // 2. Scan R2
  log(`Scanning R2 bucket for session manifests...`);
  let cursor: string | undefined;
  const sessionJsons: string[] = [];

  do {
    const list = await r2.list({ cursor, limit: 500 });
    for (const obj of list.objects) {
      stats.scanned++;
      stats.allKeys?.push(obj.key);
      if (obj.key.endsWith('session.json')) {
        sessionJsons.push(obj.key);
      }
    }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);

  log(`Found ${sessionJsons.length} session manifests.`);

  // 3. Process Sessions
  for (const key of sessionJsons) {
    try {
      const obj = await r2.get(key);
      if (!obj) {
        log(`Failed to fetch ${key}`);
        continue;
      }

      const json = await obj.json() as any;
      const sessionId = json.sessionId || key.split('/')[1];
      
      if (!sessionId) {
        log(`Could not determine sessionId for ${key}, skipping.`);
        continue;
      }

      // Check if session already exists
      const existing = await db.prepare('SELECT id FROM sessions WHERE id = ?').bind(sessionId).first();
      if (existing) {
        stats.skipped++;
        log(`Session ${sessionId} already exists, skipping.`);
        continue;
      }

      const title = json.capturedTitle || json.aiOutputs?.title || 'Recovered Session';
      const createdAt = json.capturedAt ? new Date(json.capturedAt).getTime() : Date.now();
      const shareToken = json.shareToken || crypto.randomUUID();

      if (dryRun) {
        log(`[DRY RUN] Would recover session ${sessionId}: "${title}"`);
      } else {
        await db.prepare(`
          INSERT INTO sessions (
            id, ownerId, workspaceId, sessionType, status, title, 
            capturedUrl, capturedTitle, durationMs, stepCount, 
            r2JsonKey, shareToken, createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          sessionId, 
          userId, 
          workspaceId, 
          json.sessionType || 'steps',
          'ready',
          title,
          json.capturedUrl || '',
          json.capturedTitle || '',
          json.metadata?.durationMs || 0,
          json.metadata?.stepCount || json.steps?.length || 0,
          key,
          shareToken,
          createdAt,
          createdAt
        ).run();
        
        stats.recoveredSessions++;
        log(`Recovered session ${sessionId}`);
      }

      // 4. Infer artifacts (e.g. video)
      const possibleVideoKey = `videos/${sessionId}.webm`;
      const legacyMp4Key = `videos/${sessionId}.mp4`;
      
      let videoKey = possibleVideoKey;
      let videoObj = await r2.head(videoKey);
      
      if (!videoObj) {
        videoKey = legacyMp4Key;
        videoObj = await r2.head(videoKey);
      }

      if (videoObj) {
        if (dryRun) {
          log(`[DRY RUN] Found video for ${sessionId}: ${videoKey} (${Math.round(videoObj.size / 1024 / 1024)}MB)`);
        } else {
          // Link video key to session
          await db.prepare('UPDATE sessions SET r2VideoKey = ?, storageBytes = ? WHERE id = ?')
            .bind(videoKey, videoObj.size, sessionId)
            .run();
          
          // Create artifact record
          const artifactId = crypto.randomUUID();
          await db.prepare('INSERT INTO artifacts (id, sessionId, type, status, createdAt) VALUES (?, ?, ?, ?, ?)')
            .bind(artifactId, sessionId, 'video', 'ready', createdAt)
            .run();
          
          // Create export record
          await db.prepare('INSERT INTO exports (id, artifactId, format, status, storageKey, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(crypto.randomUUID(), artifactId, videoKey.split('.').pop() || 'webm', 'ready', videoKey, createdAt)
            .run();

          log(`Linked video asset for ${sessionId}`);
        }
      }

    } catch (err: any) {
      log(`Error recovering ${key}: ${err.message}`);
    }
  }

  // 4. Optional: Scan for orphaned videos (no session.json)
  log(`Scanning for orphaned videos...`);
  let videoCursor: string | undefined;
  do {
    const list = await r2.list({ prefix: 'videos/', cursor: videoCursor, limit: 500 });
    for (const obj of list.objects) {
      const sessionId = obj.key.split('/').pop()?.split('.')[0];
      if (!sessionId) continue;

      // Check if session exists
      const session = await db.prepare('SELECT id FROM sessions WHERE id = ?').bind(sessionId).first();
      if (!session) {
        stats.orphanedAssets++;
        log(`Found orphaned video: ${obj.key} (No session record)`);
        
        if (!dryRun) {
          // Reconstruct minimal session for orphan
          const shareToken = crypto.randomUUID();
          const now = Date.now();
          await db.prepare(`
            INSERT INTO sessions (id, ownerId, workspaceId, sessionType, status, title, shareToken, r2VideoKey, storageBytes, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(sessionId, userId, workspaceId, 'video', 'ready', 'Recovered Legacy Recording', shareToken, obj.key, obj.size, now, now).run();
          log(`Created recovery record for orphaned video ${sessionId}`);
        }
      }
    }
    videoCursor = list.truncated ? list.cursor : undefined;
  } while (videoCursor);

  log(`Recovery complete. ${stats.recoveredSessions} sessions recovered.`);
  return stats;
}
