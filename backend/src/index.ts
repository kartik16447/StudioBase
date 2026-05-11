// ============================================================
// STUDIOBASE — Backend API (Cloudflare Worker + D1 + R2 + Queues)
// Carried over from ScreenVault: auth, workspaces, KV cache, metrics
// New in studiobase: sessions (replaces videos), R2, credits, pipeline queue
// ============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, OPTIONS, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

const STUDIO_BASE_URL = 'https://studio.studiobase.app';
const FREE_QUOTA_BYTES = 1073741824; // 1GB

interface Env {
  DB: D1Database;
  TOKEN_CACHE: KVNamespace;
  R2: R2Bucket;
  PIPELINE_QUEUE: Queue;
  ADMIN_EMAIL: string;
  ENCRYPTION_KEY: string;
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (method === 'OPTIONS') return new Response(null, { headers: CORS });

    let response: Response;

    if (pathname === '/auth/google' && method === 'POST') {
      response = await handleGoogleAuth(request, env);
    } else if (pathname === '/sessions' && method === 'POST') {
      response = await createSession(request, env);
    } else if (pathname === '/sessions' && method === 'GET') {
      response = await getSessions(request, env);
    } else if (pathname.startsWith('/sessions/') && method === 'GET') {
      response = await getSession(request, env);
    } else if (pathname.startsWith('/sessions/') && method === 'PATCH') {
      response = await updateSession(request, env);
    } else if (pathname.startsWith('/sessions/') && method === 'DELETE') {
      response = await deleteSession(request, env);
    } else if (pathname === '/upload/presign' && method === 'POST') {
      response = await presignUpload(request, env);
    } else if (pathname === '/upload/file' && method === 'PUT') {
      response = await handleFileUpload(request, env);
    } else if (pathname === '/assets/refresh' && method === 'POST') {
      response = await refreshAssetUrls(request, env);
    } else if (pathname === '/storage/quota' && method === 'GET') {
      response = await getStorageQuota(request, env);
    } else if (pathname === '/credits' && method === 'GET') {
      response = await getCredits(request, env);
    } else if (pathname === '/credits/topup' && method === 'POST') {
      response = await topupCredits(request, env);
    } else if (pathname === '/pipeline/trigger' && method === 'POST') {
      response = await triggerPipeline(request, env);
    } else if (pathname === '/workspaces' && method === 'GET') {
      response = await listWorkspaces(request, env);
    } else if (pathname.startsWith('/workspaces/') && method === 'PATCH') {
      response = await updateWorkspace(request, env);
    } else if (pathname === '/workspace/invite' && method === 'POST') {
      response = await createInvite(request, env);
    } else if (pathname === '/workspace/join' && method === 'POST') {
      response = await joinWorkspace(request, env);
    } else if (pathname === '/workspace/leave' && method === 'POST') {
      response = await leaveWorkspace(request, env);
    } else if (pathname === '/workspace/members' && method === 'GET') {
      response = await listWorkspaceMembers(request, env);
    } else if (pathname === '/workspace/invites' && method === 'GET') {
      response = await listWorkspaceInvites(request, env);
    } else if (pathname.startsWith('/workspace/member/') && method === 'DELETE') {
      response = await removeMember(request, env);
    } else if (pathname === '/workspace/invite/revoke' && method === 'POST') {
      response = await revokeInvite(request, env);
    } else if (pathname === '/logs' && method === 'POST') {
      response = await handleExtensionLogs(request, env);
    } else if (pathname === '/metrics/summary' && method === 'GET') {
      response = await getMetricsSummary(request, env);
    } else if (pathname === '/admin' && method === 'GET') {
      response = await handleAdmin(request, env);
    } else if (pathname.startsWith('/assets/') && method === 'GET') {
      response = await serveAsset(request, env);
    } else {
      response = jsonError('Not Found', 'NOT_FOUND', 404);
    }

    const newHeaders = new Headers(response.headers);
    Object.entries(CORS).forEach(([k, v]) => newHeaders.set(k, v));
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: newHeaders });
  },

  async scheduled(_event: any, env: Env, ctx: any) {
    ctx.waitUntil(runMaintenance(env));
  },

  async queue(batch: MessageBatch, env: Env) {
    for (const message of batch.messages) {
      try {
        await runPipeline(message.body as any, env);
        message.ack();
      } catch (err: any) {
        console.error('[PIPELINE] Failed:', err.message);
        message.retry();
      }
    }
  },
};

// ─── Sessions ────────────────────────────────────────────────

async function createSession(request: Request, env: Env) {
  let user: any;
  try { user = await getUserFromToken(request, env); }
  catch (e: any) { return jsonError(e.message, 'UNAUTHORIZED', 401); }

  try {
    const body = await request.json() as any;
    const { workspaceId, sessionType = 'steps', title, capturedUrl, capturedTitle, stepCount, durationMs } = body;

    if (!workspaceId) return jsonError('workspaceId is required', 'VALIDATION_ERROR');

    const membership = await env.DB.prepare(
      'SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?'
    ).bind(workspaceId, user.id).first();
    if (!membership) return jsonError('Unauthorized workspace access', 'FORBIDDEN', 403);

    const stats = await env.DB.prepare(
      'SELECT lastRecordingAt FROM usage_stats WHERE userId = ? AND workspaceId = ?'
    ).bind(user.id, workspaceId).first() as any;

    const now = Date.now();
    if (stats?.lastRecordingAt && now - stats.lastRecordingAt < 20000) {
      const remaining = Math.ceil((20000 - (now - stats.lastRecordingAt)) / 1000);
      return jsonError(`Wait ${remaining}s before next recording`, 'COOLDOWN', 429);
    }

    const id = crypto.randomUUID();
    const shareToken = crypto.randomUUID();

    await env.DB.prepare(
      `INSERT INTO sessions (id, ownerId, workspaceId, sessionType, status, title, capturedUrl, capturedTitle, stepCount, durationMs, shareToken, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'uploading', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, user.id, workspaceId, sessionType, title || null, capturedUrl || null, capturedTitle || null, stepCount || 0, durationMs || 0, shareToken, now, now).run();

    await env.DB.prepare(
      `INSERT INTO usage_stats (userId, workspaceId, lastRecordingAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(userId, workspaceId) DO UPDATE SET lastRecordingAt = excluded.lastRecordingAt, updatedAt = excluded.updatedAt`
    ).bind(user.id, workspaceId, now, now, now).run();

    recordEvent(env, { type: 'session_started', userId: user.id, workspaceId, sessionId: id }).catch(() => {});

    return Response.json({ id, shareToken, studioUrl: `${STUDIO_BASE_URL}/s/${shareToken}` });
  } catch (e: any) { return jsonError(e.message); }
}

async function getSessions(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const cursor = url.searchParams.get('cursor');

    if (!workspaceId) return jsonError('workspaceId is required', 'VALIDATION_ERROR');

    const membership = await env.DB.prepare(
      'SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?'
    ).bind(workspaceId, user.id).first();
    if (!membership) return jsonError('Unauthorized', 'FORBIDDEN', 403);

    let query = 'SELECT * FROM sessions WHERE workspaceId = ? AND deletedAt IS NULL';
    const params: any[] = [workspaceId];

    if (cursor) {
      const [cTime, cId] = cursor.split(':');
      query += ' AND (createdAt < ? OR (createdAt = ? AND id < ?))';
      params.push(parseInt(cTime), parseInt(cTime), cId || '');
    }
    query += ' ORDER BY createdAt DESC, id DESC LIMIT ?';
    params.push(limit + 1);

    const { results } = await env.DB.prepare(query).bind(...params).all();
    const hasMore = results.length > limit;
    const sessions = (hasMore ? results.slice(0, limit) : results).map((s: any) => ({
      ...s,
      studioUrl: `${STUDIO_BASE_URL}/s/${s.shareToken}`,
    }));

    const nextCursor = sessions.length > 0
      ? `${sessions[sessions.length - 1].createdAt}:${sessions[sessions.length - 1].id}`
      : null;

    return Response.json({ sessions, nextCursor, hasMore });
  } catch (e: any) { return jsonError(e.message); }
}

async function getSession(request: Request, env: Env) {
  try {
    const url = new URL(request.url);
    const id = url.pathname.split('/').filter(Boolean).pop();
    if (!id) return jsonError('Session ID required', 'VALIDATION_ERROR');

    let session = await env.DB.prepare(
      'SELECT * FROM sessions WHERE id = ? AND deletedAt IS NULL'
    ).bind(id).first() as any;

    if (!session) {
      session = await env.DB.prepare(
        'SELECT * FROM sessions WHERE shareToken = ? AND deletedAt IS NULL'
      ).bind(id).first() as any;
    }

    if (!session) return jsonError('Session not found', 'NOT_FOUND', 404);

    if (!session.isPublic) {
      try {
        const user = await getUserFromToken(request, env);
        const membership = await env.DB.prepare(
          'SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?'
        ).bind(session.workspaceId, user.id).first();
        if (!membership) return jsonError('Unauthorized', 'FORBIDDEN', 403);
      } catch {
        return jsonError('Authentication required', 'UNAUTHORIZED', 401);
      }
    }

    let sessionJsonUrl: string | null = null;
    if (session.r2JsonKey && session.status !== 'deleted') {
      const origin = new URL(request.url).origin;
      sessionJsonUrl = `${origin}/assets/${session.r2JsonKey}`;
    }

    recordEvent(env, { type: 'session_viewed', userId: 'anonymous', sessionId: session.id }).catch(() => {});

    return Response.json({ ...session, sessionJsonUrl, studioUrl: `${STUDIO_BASE_URL}/s/${session.shareToken}` });
  } catch (e: any) { return jsonError(e.message); }
}

async function updateSession(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    const url = new URL(request.url);
    const id = url.pathname.split('/').filter(Boolean).pop();
    if (!id) return jsonError('Session ID required', 'VALIDATION_ERROR');

    const session = await env.DB.prepare(
      'SELECT ownerId, workspaceId FROM sessions WHERE id = ? AND deletedAt IS NULL'
    ).bind(id).first() as any;
    if (!session) return jsonError('Not found', 'NOT_FOUND', 404);

    const membership = await env.DB.prepare(
      'SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?'
    ).bind(session.workspaceId, user.id).first();
    if (!membership) return jsonError('Unauthorized', 'FORBIDDEN', 403);

    const body = await request.json() as any;
    const now = Date.now();
    const sets = ['updatedAt = ?'];
    const params: any[] = [now];

    const fields: [string, any][] = [
      ['status', body.status], ['title', body.title], ['r2JsonKey', body.r2JsonKey],
      ['r2VideoKey', body.r2VideoKey], ['storageBytes', body.storageBytes],
      ['stepCount', body.stepCount], ['durationMs', body.durationMs],
      ['pipelinePath', body.pipelinePath],
    ];
    for (const [col, val] of fields) {
      if (val !== undefined && val !== null) { sets.push(`${col} = ?`); params.push(val); }
    }
    if (body.generatedOutputs) { sets.push('generatedOutputs = ?'); params.push(JSON.stringify(body.generatedOutputs)); }
    if (typeof body.isPublic === 'boolean') { sets.push('isPublic = ?'); params.push(body.isPublic ? 1 : 0); }

    params.push(id);
    await env.DB.prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();

    if (body.storageBytes && body.status === 'ready') {
      await env.DB.prepare(
        'UPDATE users SET r2StorageUsedBytes = r2StorageUsedBytes + ? WHERE id = ?'
      ).bind(body.storageBytes, user.id).run();
    }

    return Response.json({ success: true });
  } catch (e: any) { return jsonError(e.message); }
}

async function deleteSession(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    const url = new URL(request.url);
    const id = url.pathname.split('/').filter(Boolean).pop();
    if (!id) return jsonError('Session ID required', 'VALIDATION_ERROR');

    const session = await env.DB.prepare(
      'SELECT ownerId, workspaceId, r2JsonKey, r2VideoKey, storageBytes FROM sessions WHERE id = ?'
    ).bind(id).first() as any;
    if (!session) return jsonError('Not found', 'NOT_FOUND', 404);

    const membership = await env.DB.prepare(
      'SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?'
    ).bind(session.workspaceId, user.id).first() as any;

    if (session.ownerId !== user.id && membership?.role !== 'owner') {
      return jsonError('Permission denied', 'FORBIDDEN', 403);
    }

    await env.DB.prepare('UPDATE sessions SET deletedAt = ? WHERE id = ?').bind(Date.now(), id).run();

    if (session.storageBytes) {
      await env.DB.prepare(
        'UPDATE users SET r2StorageUsedBytes = MAX(0, r2StorageUsedBytes - ?) WHERE id = ?'
      ).bind(session.storageBytes, user.id).run();
    }

    if (session.r2JsonKey) env.R2.delete(session.r2JsonKey).catch(() => {});
    if (session.r2VideoKey) env.R2.delete(session.r2VideoKey).catch(() => {});

    return Response.json({ success: true });
  } catch (e: any) { return jsonError(e.message); }
}

// ─── Upload & Assets ─────────────────────────────────────────

async function presignUpload(request: Request, env: Env) {
  let user: any;
  try { user = await getUserFromToken(request, env); }
  catch (e: any) { return jsonError(e.message, 'UNAUTHORIZED', 401); }

  try {
    const body = await request.json() as any;
    const { sessionId, files } = body;
    if (!sessionId || !files?.length) return jsonError('sessionId and files[] required', 'VALIDATION_ERROR');

    const userRecord = await env.DB.prepare(
      'SELECT r2StorageUsedBytes, r2StorageQuotaBytes FROM users WHERE id = ?'
    ).bind(user.id).first() as any;

    if (userRecord && userRecord.r2StorageUsedBytes >= (userRecord.r2StorageQuotaBytes || FREE_QUOTA_BYTES)) {
      return jsonError('Storage quota exceeded', 'QUOTA_EXCEEDED', 403);
    }

    // Return worker proxy upload URLs — no S3 credentials needed
    const backendBase = new URL(request.url).origin;
    const files_out = files.map((f: any) => ({
      key: f.key,
      contentType: f.contentType,
      uploadUrl: `${backendBase}/upload/file?key=${encodeURIComponent(f.key)}`
    }));

    return Response.json({ sessionId, files: files_out });
  } catch (e: any) { return jsonError(e.message); }
}

async function handleFileUpload(request: Request, env: Env) {
  let user: any;
  try { user = await getUserFromToken(request, env); }
  catch (e: any) { return jsonError(e.message, 'UNAUTHORIZED', 401); }

  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    if (!key) return jsonError('key query param required', 'VALIDATION_ERROR');

    // Security: only allow uploads under sessions/ or screenshots/ prefixes
    if (!key.startsWith('sessions/') && !key.startsWith('screenshots/')) {
      return jsonError('Invalid upload path', 'FORBIDDEN', 403);
    }

    const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
    const body = await request.arrayBuffer();

    await env.R2.put(key, body, {
      httpMetadata: { contentType }
    });

    return Response.json({ success: true, key });
  } catch (e: any) { return jsonError(e.message); }
}

async function refreshAssetUrls(request: Request, env: Env) {
  try {
    const body = await request.json() as any;
    const { keys } = body;
    if (!keys?.length) return jsonError('keys[] required', 'VALIDATION_ERROR');

    const assets: Record<string, string> = {};
    for (const key of keys) {
      assets[key] = `https://assets.studiobase.app/${key}`;
    }

    return Response.json({ assets });
  } catch (e: any) { return jsonError(e.message); }
}

async function serveAsset(request: Request, env: Env) {
  try {
    // Strip the leading /assets/ prefix to get the R2 key
    const url = new URL(request.url);
    const key = url.pathname.replace(/^\/assets\//, '');
    if (!key) return jsonError('Asset key required', 'VALIDATION_ERROR');

    const object = await env.R2.get(key);
    if (!object) return jsonError('Asset not found', 'NOT_FOUND', 404);

    const contentType = object.httpMetadata?.contentType || 'application/octet-stream';
    return new Response(object.body as any, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (e: any) { return jsonError(e.message); }
}

// ─── Storage & Credits ───────────────────────────────────────

async function getStorageQuota(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    const record = await env.DB.prepare(
      'SELECT r2StorageUsedBytes, r2StorageQuotaBytes FROM users WHERE id = ?'
    ).bind(user.id).first() as any;

    const used = record?.r2StorageUsedBytes || 0;
    const quota = record?.r2StorageQuotaBytes || FREE_QUOTA_BYTES;
    return Response.json({ usedBytes: used, quotaBytes: quota, percentUsed: Math.round((used / quota) * 100) });
  } catch (e: any) { return jsonError(e.message); }
}

async function getCredits(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    const record = await env.DB.prepare(
      'SELECT creditsBalance FROM users WHERE id = ?'
    ).bind(user.id).first() as any;
    return Response.json({ balance: record?.creditsBalance || 0 });
  } catch (e: any) { return jsonError(e.message); }
}

async function topupCredits(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    const body = await request.json() as any;
    const { amount } = body;
    if (!amount || amount <= 0) return jsonError('Invalid amount', 'VALIDATION_ERROR');

    // TODO: verify Stripe payment before crediting
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET creditsBalance = creditsBalance + ? WHERE id = ?').bind(amount, user.id),
      env.DB.prepare('INSERT INTO credits_ledger (id, userId, delta, reason, createdAt) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), user.id, amount, 'topup', now),
    ]);

    const updated = await env.DB.prepare('SELECT creditsBalance FROM users WHERE id = ?').bind(user.id).first() as any;
    return Response.json({ balance: updated?.creditsBalance || 0 });
  } catch (e: any) { return jsonError(e.message); }
}

// ─── Pipeline ────────────────────────────────────────────────

async function triggerPipeline(request: Request, env: Env) {
  let user: any;
  try { user = await getUserFromToken(request, env); }
  catch (e: any) { return jsonError(e.message, 'UNAUTHORIZED', 401); }

  try {
    const body = await request.json() as any;
    const { sessionId, requestedOutputs } = body;
    if (!sessionId) return jsonError('sessionId required', 'VALIDATION_ERROR');

    const session = await env.DB.prepare(
      'SELECT * FROM sessions WHERE id = ? AND ownerId = ?'
    ).bind(sessionId, user.id).first() as any;
    if (!session) return jsonError('Session not found', 'NOT_FOUND', 404);

    const creditCost =
      (requestedOutputs?.sop ? 1 : 0) +
      (requestedOutputs?.demo ? 1 : 0) +
      (requestedOutputs?.video ? 2 : 0);

    if (creditCost === 0) return jsonError('Select at least one output', 'VALIDATION_ERROR');

    const userRecord = await env.DB.prepare('SELECT creditsBalance FROM users WHERE id = ?').bind(user.id).first() as any;
    if ((userRecord?.creditsBalance || 0) < creditCost) {
      await env.DB.prepare('UPDATE sessions SET status = ? WHERE id = ?').bind('credit_exhausted', sessionId).run();
      return jsonError(`Need ${creditCost} credits, have ${userRecord?.creditsBalance || 0}`, 'INSUFFICIENT_CREDITS', 402);
    }

    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET creditsBalance = creditsBalance - ? WHERE id = ?').bind(creditCost, user.id),
      env.DB.prepare('INSERT INTO credits_ledger (id, userId, delta, reason, sessionId, createdAt) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), user.id, -creditCost, 'generation', sessionId, now),
      env.DB.prepare('UPDATE sessions SET status = ?, updatedAt = ? WHERE id = ?').bind('processing', now, sessionId),
    ]);

    await env.PIPELINE_QUEUE.send({ sessionId, userId: user.id, r2JsonKey: session.r2JsonKey, requestedOutputs });

    return Response.json({ success: true, creditCost, queuedAt: now });
  } catch (e: any) { return jsonError(e.message); }
}

async function runPipeline(job: any, env: Env) {
  const { sessionId } = job;
  console.log(`[PIPELINE] Starting: ${sessionId}`);
  // Phase 3 will implement AI text + TTS generation here
  await env.DB.prepare(
    'UPDATE sessions SET status = ?, pipelinePath = ?, updatedAt = ? WHERE id = ?'
  ).bind('ready', 'cloud', Date.now(), sessionId).run();
  console.log(`[PIPELINE] Done: ${sessionId}`);
}

// ─── Auth (carried over from ScreenVault) ────────────────────

async function handleGoogleAuth(request: Request, env: Env) {
  try {
    const body = await request.json() as any;
    const { accessToken } = body;
    if (!accessToken) return jsonError('Missing accessToken', 'AUTH_ERROR');

    const googleRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!googleRes.ok) return jsonError('Invalid access token', 'AUTH_ERROR');

    const googleUser = await googleRes.json() as any;
    const { id: googleSub, email, name, picture } = googleUser;
    if (!googleSub || !email) return jsonError('Invalid Google user data', 'AUTH_ERROR');

    const now = Date.now();
    const linked = await env.DB.prepare('SELECT userId FROM linked_accounts WHERE googleSub = ?').bind(googleSub).first() as any;
    let userId: string;

    if (linked) {
      userId = linked.userId;
    } else {
      const authHeader = request.headers.get('Authorization');
      let currentUser: any = null;
      if (authHeader) {
        try { currentUser = await getUserFromToken(request, env); }
        catch (e: any) { return jsonError(e.message, 'UNAUTHORIZED', 401); }
      }

      if (currentUser) {
        userId = currentUser.id;
      } else {
        // Check if user already exists by email (handles re-auth after partial failures)
        const existing = await env.DB.prepare(
          'SELECT id FROM users WHERE email = ?'
        ).bind(email).first() as any;

        if (existing) {
          userId = existing.id;
        } else {
          userId = crypto.randomUUID();
          await env.DB.prepare(
            'INSERT INTO users (id, email, name, picture, createdAt, updatedAt, lastLoginAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).bind(userId, email, name, picture, now, now, now).run();
        }
      }

      await env.DB.prepare(
        'INSERT OR IGNORE INTO linked_accounts (id, userId, email, googleSub, createdAt) VALUES (?, ?, ?, ?, ?)'
      ).bind(crypto.randomUUID(), userId, email, googleSub, now).run();
    }

    await env.DB.prepare('UPDATE users SET lastLoginAt = ?, updatedAt = ? WHERE id = ?').bind(now, now, userId).run();

    let workspace = await env.DB.prepare('SELECT * FROM workspaces WHERE ownerId = ?').bind(userId).first() as any;
    if (!workspace) {
      const workspaceId = crypto.randomUUID();
      const slug = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + userId.slice(0, 6);
      try {
        await env.DB.prepare(
          'INSERT INTO workspaces (id, slug, ownerId, name, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(workspaceId, slug, userId, name || email, now, now).run();
      } catch {
        // Race condition: another concurrent request already created the workspace — re-read below
      }
      workspace = await env.DB.prepare('SELECT * FROM workspaces WHERE ownerId = ?').bind(userId).first() as any
        || { id: workspaceId, slug };
    }

    await env.DB.prepare(
      'INSERT OR IGNORE INTO workspace_members (userId, workspaceId, role, joinedAt) VALUES (?, ?, ?, ?)'
    ).bind(userId, workspace.id, 'owner', now).run();

    await env.DB.prepare(
      'INSERT OR IGNORE INTO usage_stats (userId, workspaceId, createdAt, updatedAt) VALUES (?, ?, ?, ?)'
    ).bind(userId, workspace.id, now, now).run();

    const activeMembership = await env.DB.prepare(
      'SELECT workspaceId, role FROM workspace_members WHERE userId = ? ORDER BY joinedAt ASC'
    ).bind(userId).first() as any;

    const resolvedWorkspaceId = activeMembership?.workspaceId || workspace.id;
    const resolvedWorkspace = await env.DB.prepare('SELECT slug FROM workspaces WHERE id = ?').bind(resolvedWorkspaceId).first() as any;

    return Response.json({
      userId, email,
      workspaceId: resolvedWorkspaceId,
      workspaceSlug: resolvedWorkspace?.slug || workspace.slug,
      workspaceRole: activeMembership?.role || 'owner',
    });
  } catch (e: any) { return jsonError(e.message, 'AUTH_ERROR'); }
}

// ─── Workspaces (carried over, unchanged) ────────────────────

async function listWorkspaces(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    const { results } = await env.DB.prepare(
      `SELECT w.id, w.name, w.slug, m.role, w.ownerId FROM workspaces w
       JOIN workspace_members m ON w.id = m.workspaceId WHERE m.userId = ? ORDER BY m.joinedAt ASC`
    ).bind(user.id).all();
    return Response.json({ workspaces: results });
  } catch (e: any) { return jsonError(e.message); }
}

async function updateWorkspace(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    const workspaceId = new URL(request.url).pathname.split('/').pop();
    const body = await request.json() as any;
    const workspace = await env.DB.prepare('SELECT ownerId FROM workspaces WHERE id = ?').bind(workspaceId).first() as any;
    if (!workspace || workspace.ownerId !== user.id) return jsonError('Only owner can update', 'FORBIDDEN', 403);
    if (body.name) await env.DB.prepare('UPDATE workspaces SET name = ? WHERE id = ?').bind(body.name, workspaceId).run();
    return Response.json({ success: true });
  } catch (e: any) { return jsonError(e.message); }
}

async function createInvite(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    const { workspaceId, role } = await request.json() as any;
    if (!workspaceId) return jsonError('workspaceId required', 'VALIDATION_ERROR');
    const workspace = await env.DB.prepare('SELECT id FROM workspaces WHERE id = ? AND ownerId = ?').bind(workspaceId, user.id).first();
    if (!workspace) return jsonError('Permission denied', 'FORBIDDEN', 403);
    const now = Date.now();
    const { count } = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM invites WHERE workspaceId = ? AND revokedAt IS NULL AND (expiresAt IS NULL OR expiresAt > ?)'
    ).bind(workspaceId, now).first() as any;
    if (count >= 10) return jsonError('Max 10 active invites', 'USAGE_LIMIT', 429);
    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
    const inviteRole = role === 'owner' ? 'owner' : 'member';
    await env.DB.prepare('INSERT INTO invites (id, workspaceId, token, role, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?)').bind(id, workspaceId, token, inviteRole, now, expiresAt).run();
    return Response.json({ token, expiresAt, role: inviteRole });
  } catch (e: any) { return jsonError(e.message); }
}

async function joinWorkspace(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    const { token } = await request.json() as any;
    if (!token) return jsonError('token required', 'VALIDATION_ERROR');
    const now = Date.now();
    const invite = await env.DB.prepare('SELECT * FROM invites WHERE token = ?').bind(token).first() as any;
    if (!invite) return jsonError('Invite invalid', 'NOT_FOUND', 404);
    if (invite.revokedAt) return jsonError('Invite revoked', 'FORBIDDEN', 403);
    if (invite.expiresAt && invite.expiresAt < now) return jsonError('Invite expired', 'FORBIDDEN', 403);
    await env.DB.prepare('INSERT OR IGNORE INTO workspace_members (userId, workspaceId, role, joinedAt) VALUES (?, ?, ?, ?)').bind(user.id, invite.workspaceId, invite.role || 'member', now).run();
    return Response.json({ success: true, workspaceId: invite.workspaceId });
  } catch (e: any) { return jsonError(e.message); }
}

async function leaveWorkspace(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    const { workspaceId } = await request.json() as any;
    const membership = await env.DB.prepare('SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?').bind(workspaceId, user.id).first() as any;
    if (!membership) return jsonError('Not a member', 'NOT_FOUND', 404);
    if (membership.role === 'owner') return jsonError('Owners cannot leave', 'FORBIDDEN', 403);
    await env.DB.prepare('DELETE FROM workspace_members WHERE workspaceId = ? AND userId = ?').bind(workspaceId, user.id).run();
    return Response.json({ success: true });
  } catch (e: any) { return jsonError(e.message); }
}

async function listWorkspaceMembers(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    const workspaceId = new URL(request.url).searchParams.get('workspaceId');
    if (!workspaceId) return jsonError('workspaceId required', 'VALIDATION_ERROR');
    const membership = await env.DB.prepare('SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?').bind(workspaceId, user.id).first();
    if (!membership) return jsonError('Unauthorized', 'FORBIDDEN', 403);
    const { results } = await env.DB.prepare(
      `SELECT users.id as userId, users.email, workspace_members.role FROM workspace_members
       JOIN users ON users.id = workspace_members.userId WHERE workspace_members.workspaceId = ?`
    ).bind(workspaceId).all();
    return Response.json(results || []);
  } catch (e: any) { return jsonError(e.message); }
}

async function listWorkspaceInvites(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    const workspaceId = new URL(request.url).searchParams.get('workspaceId');
    if (!workspaceId) return jsonError('workspaceId required', 'VALIDATION_ERROR');
    const membership = await env.DB.prepare('SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?').bind(workspaceId, user.id).first();
    if (!membership) return jsonError('Unauthorized', 'FORBIDDEN', 403);
    const { results } = await env.DB.prepare('SELECT id, token, role, createdAt, expiresAt, revokedAt FROM invites WHERE workspaceId = ? ORDER BY createdAt DESC').bind(workspaceId).all();
    return Response.json(results || []);
  } catch (e: any) { return jsonError(e.message); }
}

async function revokeInvite(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    const { inviteId } = await request.json() as any;
    const invite = await env.DB.prepare('SELECT workspaceId FROM invites WHERE id = ?').bind(inviteId).first() as any;
    if (!invite) return jsonError('Invite not found', 'NOT_FOUND', 404);
    const membership = await env.DB.prepare('SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?').bind(invite.workspaceId, user.id).first() as any;
    if (!membership || membership.role !== 'owner') return jsonError('Only owners can revoke', 'FORBIDDEN', 403);
    await env.DB.prepare('UPDATE invites SET revokedAt = ? WHERE id = ?').bind(Date.now(), inviteId).run();
    return Response.json({ success: true });
  } catch (e: any) { return jsonError(e.message); }
}

async function removeMember(request: Request, env: Env) {
  try {
    const currentUser = await getUserFromToken(request, env);
    const url = new URL(request.url);
    const userIdToRemove = url.pathname.split('/').pop();
    const workspaceId = url.searchParams.get('workspaceId');
    if (!userIdToRemove || !workspaceId) return jsonError('userId and workspaceId required', 'VALIDATION_ERROR');
    const membership = await env.DB.prepare('SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?').bind(workspaceId, currentUser.id).first() as any;
    if (!membership || membership.role !== 'owner') return jsonError('Only owners can remove members', 'FORBIDDEN', 403);
    if (userIdToRemove === currentUser.id) return jsonError('Cannot remove yourself', 'BAD_REQUEST', 400);
    await env.DB.prepare('DELETE FROM workspace_members WHERE workspaceId = ? AND userId = ?').bind(workspaceId, userIdToRemove).run();
    return Response.json({ success: true });
  } catch (e: any) { return jsonError(e.message); }
}

// ─── Metrics & Logs ──────────────────────────────────────────

async function getMetricsSummary(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    const workspaceId = new URL(request.url).searchParams.get('workspaceId');
    if (!workspaceId) return jsonError('workspaceId required', 'VALIDATION_ERROR');
    const membership = await env.DB.prepare('SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?').bind(workspaceId, user.id).first() as any;
    if (!membership || membership.role !== 'owner') return jsonError('Owner only', 'FORBIDDEN', 403);
    const stats = await env.DB.prepare(
      `SELECT COUNT(*) as total, SUM(CASE WHEN status='ready' THEN 1 ELSE 0 END) as ready,
       SUM(storageBytes) as totalBytes FROM sessions WHERE workspaceId = ? AND deletedAt IS NULL`
    ).bind(workspaceId).first();
    return Response.json({ workspaceId, ...stats });
  } catch (e: any) { return jsonError(e.message); }
}

async function handleExtensionLogs(request: Request, env: Env) {
  let user: any;
  try { user = await getUserFromToken(request, env); }
  catch (e: any) { return jsonError(e.message, 'UNAUTHORIZED', 401); }
  try {
    const { tag, data, sessionId } = await request.json() as any;
    await env.DB.prepare('INSERT INTO debug_logs (userId, tag, data, source, sessionId) VALUES (?, ?, ?, ?, ?)').bind(user.id, tag, JSON.stringify(data), 'extension', sessionId || null).run();
    return Response.json({ success: true });
  } catch (e: any) { return jsonError(e.message); }
}

async function handleAdmin(request: Request, env: Env) {
  try {
    const user = await getUserFromToken(request, env);
    if (user.email !== env.ADMIN_EMAIL) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);
    const [users, sessions, ready] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as count FROM users').first() as any,
      env.DB.prepare('SELECT COUNT(*) as count FROM sessions WHERE deletedAt IS NULL').first() as any,
      env.DB.prepare('SELECT COUNT(*) as count FROM sessions WHERE status="ready" AND deletedAt IS NULL').first() as any,
    ]);
    return Response.json({ totalUsers: users?.count || 0, totalSessions: sessions?.count || 0, readySessions: ready?.count || 0 });
  } catch (e: any) { return jsonError(e.message); }
}

// ─── Maintenance ─────────────────────────────────────────────

async function runMaintenance(env: Env) {
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  await env.DB.prepare('DELETE FROM debug_logs WHERE timestamp < datetime(?, "unixepoch")').bind(Math.floor(fourteenDaysAgo / 1000)).run().catch(console.error);
}

// ─── Utilities ───────────────────────────────────────────────

async function getUserFromToken(request: Request, env: Env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Missing Authorization header');

  const token = authHeader.split(' ')[1];
  const now = Date.now();

  const cached = await env.TOKEN_CACHE.get(token, 'json') as { user: any; expiresAt: number } | null;
  if (cached && cached.expiresAt > now) return cached.user;

  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${token}` } });

  if (!res.ok) {
    if (cached && now - cached.expiresAt < 10 * 60 * 1000) return cached.user;
    throw new Error('Invalid access token');
  }

  const googleUser = await res.json() as any;
  const linked = await env.DB.prepare('SELECT userId FROM linked_accounts WHERE googleSub = ?').bind(googleUser.id).first() as any;
  if (!linked?.userId) throw new Error('User not found. Please sign in again.');

  const userInfo = { id: linked.userId, email: googleUser.email, name: googleUser.name, picture: googleUser.picture };
  await env.TOKEN_CACHE.put(token, JSON.stringify({ user: userInfo, expiresAt: now + 10 * 60 * 1000 }), { expirationTtl: 1200 });
  return userInfo;
}

async function recordEvent(env: Env, data: { type: string; userId: string; workspaceId?: string; sessionId?: string }) {
  try {
    await env.DB.prepare('INSERT INTO metrics_events (id, type, userId, workspaceId, sessionId, createdAt) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), data.type, data.userId, data.workspaceId || null, data.sessionId || null, Date.now()).run();
  } catch (e) { console.error('recordEvent failed:', e); }
}

function jsonError(message: string, code = 'API_ERROR', status = 400) {
  return new Response(JSON.stringify({ error: message, code }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
