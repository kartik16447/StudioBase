/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS, DELETE, PATCH',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
	'Access-Control-Max-Age': '86400',
};

interface Env {
	DB: D1Database;
	TOKEN_CACHE: KVNamespace;
	ADMIN_EMAIL: string;
	BUCKET: R2Bucket;
}

export default {
	async fetch(request: Request, env: Env) {
		const url = new URL(request.url);
		const { pathname } = url;
		const method = request.method;

		if (method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		let response: Response;

		if (pathname === '/auth/google' && method === 'POST') {
			response = await handleGoogleAuth(request, env);
		} else if (pathname === '/videos') {
			if (method === 'POST') response = await createVideo(request, env);
			else if (method === 'GET') response = await getVideos(request, env);
			else response = jsonError('Method Not Allowed', 'METHOD_NOT_ALLOWED', 405);
		} else if (pathname.startsWith('/videos/')) {
			if (method === 'PATCH') response = await updateVideo(request, env);
			else if (method === 'DELETE') response = await deleteVideo(request, env);
			else if (method === 'GET') response = await getVideo(request, env);
			else response = jsonError('Method Not Allowed', 'METHOD_NOT_ALLOWED', 405);
		} else if (pathname === '/folders') {
			if (method === 'POST') response = await createFolder(request, env);
			else if (method === 'GET') response = await listFolders(request, env);
			else response = jsonError('Method Not Allowed', 'METHOD_NOT_ALLOWED', 405);
		} else if (pathname.startsWith('/folders/')) {
			if (method === 'PATCH') response = await renameFolder(request, env);
			else if (method === 'DELETE') response = await deleteFolder(request, env);
			else response = jsonError('Method Not Allowed', 'METHOD_NOT_ALLOWED', 405);
		} else if (pathname === '/uploads/init' && method === 'POST') {
			response = await initUpload(request, env);
		} else if (pathname === '/uploads/part' && method === 'PUT') {
			response = await uploadPart(request, env);
		} else if (pathname === '/uploads/complete' && method === 'POST') {
			response = await completeUpload(request, env);
		} else if (pathname === '/uploads/abort' && method === 'POST') {
			response = await abortUpload(request, env);
		} else if (pathname === '/usage/update' && method === 'POST') {
			response = await updateUsage(request, env);
		} else if (pathname === '/workspace/invite' && method === 'POST') {
			response = await createInvite(request, env);
		} else if (pathname === '/workspace/join' && method === 'POST') {
			response = await joinWorkspace(request, env);
		} else if (pathname === '/workspaces' && method === 'GET') {
			response = await listWorkspaces(request, env);
		} else if (pathname.startsWith('/workspaces/') && method === 'PATCH') {
			response = await updateWorkspace(request, env);
		} else if (pathname === '/workspace/leave' && method === 'POST') {
			response = await leaveWorkspace(request, env);
		} else if (pathname === '/metrics/summary' && method === 'GET') {
			response = await getMetricsSummary(request, env);
		} else if (pathname === '/admin' && method === 'GET') {
			response = await handleAdmin(request, env);
		} else if (pathname === '/admin/waitlist' && method === 'GET') {
			response = await adminGetWaitlist(request, env);
		} else if (pathname === '/admin/waitlist/approve' && method === 'POST') {
			response = await adminApproveWaitlist(request, env);
		} else if (pathname === '/workspace/members' && method === 'GET') {
			response = await listWorkspaceMembers(request, env);
		} else if (pathname === '/workspace/invites' && method === 'GET') {
			response = await listWorkspaceInvites(request, env);
		} else if (pathname.startsWith('/workspace/member/') && method === 'DELETE') {
			response = await removeMember(request, env);
		} else if (pathname === '/workspace/invite/revoke' && method === 'POST') {
			response = await revokeInvite(request, env);
		} else if (pathname === '/workspace/invite/log-copy' && method === 'POST') {
			response = await logInviteCopy(request, env);
		} else if (pathname.startsWith('/accounts/') && method === 'PATCH') {
			response = await updateAccount(request, env);
		} else if (pathname === '/waitlist' && method === 'POST') {
			response = await joinWaitlist(request, env);
		} else if (pathname === '/account' && method === 'GET') {
			response = await getAccount(request, env);
		} else if (pathname === '/logs' && method === 'POST') {
			response = await handleExtensionLogs(request, env);
		} else if (pathname === '/admin/migrate-file-ids' && method === 'POST') {
			response = await migrateFileIds(request, env);
		} else {
			response = jsonError('Not Found', 'NOT_FOUND', 404);
		}

		// Add CORS headers to all responses
		const newHeaders = new Headers(response.headers);
		Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: newHeaders,
		});
	},

	async scheduled(event: any, env: any, ctx: any) {
		ctx.waitUntil(runMaintenance(env));
	},
};

async function runMaintenance(env: any) {
	const now = Date.now();
	const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;

	console.log('[SV][MAINTENANCE] Starting daily cleanup...');

	try {
		// 1. Purge old debug logs (14 day retention)
		const { meta: logMeta } = await env.DB.prepare('DELETE FROM debug_logs WHERE timestamp < datetime(?, "unixepoch")')
			.bind(Math.floor(fourteenDaysAgo / 1000))
			.run();
		console.log(`[SV][MAINTENANCE] Purged ${logMeta?.changes || 0} old debug logs.`);

		// 2. Purge old metrics events (90-day retention)
		const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;
		const { meta: metricsMeta } = await env.DB.prepare('DELETE FROM metrics_events WHERE timestamp < datetime(?, "unixepoch")')
			.bind(Math.floor(ninetyDaysAgo / 1000))
			.run();
		console.log(`[SV][MAINTENANCE] Purged ${metricsMeta?.changes || 0} old metrics events.`);
	} catch (e: any) {
		console.error('[SV][MAINTENANCE] Cleanup failed:', e.message);
	}
}

function isAdmin(email: string, env: Env): boolean {
	const admins = [env.ADMIN_EMAIL, 'kartik.upadhyay@foyr.com'].filter(Boolean);
	return admins.includes(email);
}

async function adminGetWaitlist(request: Request, env: Env) {
	try {
		const user = await getUserFromToken(request, env);
		if (!isAdmin(user.email, env)) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);
		const { results } = await env.DB.prepare(
			'SELECT id, email, createdAt, approvedAt FROM waitlist ORDER BY createdAt DESC'
		).all();
		return Response.json({ waitlist: results || [] });
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function adminApproveWaitlist(request: Request, env: Env) {
	try {
		const user = await getUserFromToken(request, env);
		if (!isAdmin(user.email, env)) return jsonError('Unauthorized', 'UNAUTHORIZED', 401);
		const { id } = (await request.json()) as any;
		if (!id) return jsonError('id required', 'VALIDATION_ERROR');
		await env.DB.prepare('UPDATE waitlist SET approvedAt = ? WHERE id = ?').bind(Date.now(), id).run();
		return Response.json({ success: true });
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function handleAdmin(request: Request, env: Env) {
	try {
		const user = await getUserFromToken(request, env);
		if (!isAdmin(user.email, env)) {
			return jsonError('Unauthorized', 'UNAUTHORIZED', 401);
		}

		const url = new URL(request.url);
		const sessionIdFilter = url.searchParams.get('sessionId');
		const emailFilter = url.searchParams.get('email');
		const idFilter = url.searchParams.get('id'); // encryptedFileId

		// --- MODE A: USER/ACCOUNT SEARCH ---
		if (emailFilter) {
			// 1. Resolve User
			let targetUser = (await env.DB.prepare('SELECT id, email, name, picture, createdAt FROM users WHERE email = ?').bind(emailFilter).first()) as any;
			
			if (!targetUser) {
				// Try linked accounts
				const linked = (await env.DB.prepare('SELECT userId FROM linked_accounts WHERE email = ?').bind(emailFilter).first()) as any;
				if (linked) {
					targetUser = (await env.DB.prepare('SELECT id, email, name, picture, createdAt FROM users WHERE id = ?').bind(linked.userId).first()) as any;
				}
			}

			if (!targetUser) return Response.json({ type: 'not_found', message: 'User not found' });

			// 2. Fetch User Context
			const linkedAccounts = (await env.DB.prepare('SELECT email, createdAt FROM linked_accounts WHERE userId = ?').bind(targetUser.id).all()).results || [];
			const workspaces = (await env.DB.prepare('SELECT w.id, w.name, m.role FROM workspaces w JOIN workspace_members m ON w.id = m.workspaceId WHERE m.userId = ?').bind(targetUser.id).all()).results || [];
			
			// 3. Operational Summary
			const stats = (await env.DB.prepare(`
				SELECT 
					COUNT(DISTINCT CASE WHEN type = 'recording_started' THEN sessionId ELSE NULL END) as recordings,
					COUNT(DISTINCT CASE WHEN type = 'upload_success' THEN sessionId ELSE NULL END) as uploads,
					COUNT(DISTINCT CASE WHEN type = 'playback_started' THEN sessionId ELSE NULL END) as playbacks,
					COUNT(DISTINCT CASE WHEN type IN ('upload_failed', 'playback_failed', 'video_not_found', 'decrypt_failed', 'drive_permission_denied', 'invalid_encrypted_token') AND COALESCE(json_extract(metadata, '$.errorCode'), '') != 'BROWSER_VIDEO_ERROR' THEN sessionId ELSE NULL END) as failures
				FROM metrics_events WHERE userId = ?
			`).bind(targetUser.id).first()) as any;

			const recentEvents = (await env.DB.prepare('SELECT type, sessionId, metadata, createdAt FROM metrics_events WHERE userId = ? ORDER BY createdAt DESC LIMIT 50').bind(targetUser.id).all()).results || [];

			return Response.json({
				type: 'user',
				user: targetUser,
				linkedAccounts,
				workspaces,
				stats,
				recentEvents
			});
		}

		// --- MODE B: VIDEO/URL INVESTIGATION ---
		if (idFilter) {
			const video = (await env.DB.prepare('SELECT id, title, ownerId, workspaceId, accountEmail, status, createdAt, duration, actualDurationMs FROM videos WHERE encryptedFileId = ? OR id = ?')
				.bind(idFilter, idFilter)
				.first()) as any;
			
			if (!video) return Response.json({ type: 'not_found', message: 'Video not found' });

			const playbackEvents = (await env.DB.prepare('SELECT type, sessionId, metadata, createdAt FROM metrics_events WHERE videoId = ? ORDER BY createdAt DESC').bind(video.id).all()).results || [];

			return Response.json({
				type: 'video',
				video,
				playbackEvents
			});
		}

		// --- MODE C: SESSION TRACE / GLOBAL HEALTH ---
		// 1. Total Stats
		const totalUsers = (await env.DB.prepare('SELECT COUNT(*) as count FROM users').first()) as any;
		const totalVideos = (await env.DB.prepare('SELECT COUNT(*) as count FROM videos').first()) as any;
		const now = Date.now();
		const oneDayAgo = now - 24 * 60 * 60 * 1000;
		const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
		const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
		const activeUsers = (await env.DB.prepare('SELECT COUNT(DISTINCT userId) as count FROM metrics_events WHERE createdAt >= ?').bind(oneDayAgo).first()) as any;

		// 2. Playback Stats (Operational only, exclude noise, deduplicate by session, 30d window)
		const playbackStats = (await env.DB.prepare(`
			SELECT 
				COUNT(DISTINCT CASE WHEN type = 'playback_started' THEN sessionId ELSE NULL END) as started,
				COUNT(DISTINCT CASE WHEN type IN ('playback_failed', 'video_not_found', 'decrypt_failed', 'drive_permission_denied', 'invalid_encrypted_token') 
					AND COALESCE(json_extract(metadata, '$.errorCode'), '') != 'BROWSER_VIDEO_ERROR' 
					THEN sessionId ELSE NULL END) as failed
			FROM metrics_events
			WHERE createdAt >= ?
		`).bind(thirtyDaysAgo).first()) as any;

		const topPlaybackErrors = (await env.DB.prepare(`
			SELECT json_extract(metadata, '$.errorCode') as error, COUNT(DISTINCT sessionId) as count 
			FROM metrics_events 
			WHERE type IN ('playback_failed', 'video_not_found', 'decrypt_failed', 'drive_permission_denied', 'invalid_encrypted_token')
			AND COALESCE(json_extract(metadata, '$.errorCode'), '') != 'BROWSER_VIDEO_ERROR'
			AND createdAt >= ?
			GROUP BY error ORDER BY count DESC LIMIT 5
		`).bind(thirtyDaysAgo).all()).results || [];

		// 3. Upload Stats (Deduplicate by session, 30d window)
		const uploadStats = (await env.DB.prepare(`
			SELECT 
				COUNT(DISTINCT CASE WHEN type = 'recording_started' THEN sessionId ELSE NULL END) as started,
				COUNT(DISTINCT CASE WHEN type = 'upload_success' THEN sessionId ELSE NULL END) as success,
				COUNT(DISTINCT CASE WHEN type = 'upload_failed' THEN sessionId ELSE NULL END) as failed
			FROM metrics_events
			WHERE createdAt >= ?
		`).bind(thirtyDaysAgo).first()) as any;

		const topUploadErrors = (await env.DB.prepare(`
			SELECT json_extract(metadata, '$.error') as error, COUNT(DISTINCT sessionId) as count 
			FROM metrics_events WHERE type = 'upload_failed'
			AND createdAt >= ?
			GROUP BY error ORDER BY count DESC LIMIT 5
		`).bind(thirtyDaysAgo).all()).results || [];

		// 4. Infrastructure Health Stats (last 24h/7d)
		// A. KV Cache (24h)
		const kvHits = (await env.DB.prepare('SELECT COUNT(*) as count FROM debug_logs WHERE tag = "KV_CACHE_HIT" AND timestamp >= datetime(?, "unixepoch")').bind(Math.floor(oneDayAgo/1000)).first()) as any;
		const kvMisses = (await env.DB.prepare('SELECT COUNT(*) as count FROM debug_logs WHERE tag = "KV_CACHE_MISS" AND timestamp >= datetime(?, "unixepoch")').bind(Math.floor(oneDayAgo/1000)).first()) as any;
		const hitTotal = (kvHits?.count || 0) + (kvMisses?.count || 0);

		// B. Chunk Failures (7d)
		const chunkFailuresTotal = (await env.DB.prepare('SELECT COUNT(*) as count FROM debug_logs WHERE tag = "UPLOAD_CHUNK_FAILED" AND timestamp >= datetime(?, "unixepoch")').bind(Math.floor(sevenDaysAgo/1000)).first()) as any;
		const topChunkErrors = (await env.DB.prepare(`
			SELECT json_extract(data, '$.error') as error, COUNT(*) as count 
			FROM debug_logs WHERE tag = "UPLOAD_CHUNK_FAILED" 
			AND timestamp >= datetime(?, "unixepoch")
			GROUP BY error ORDER BY count DESC LIMIT 5
		`).bind(Math.floor(sevenDaysAgo/1000)).all()).results || [];

		// C. sid-only links (7d)
		const sidOnlyRes = (await env.DB.prepare('SELECT sessionId FROM debug_logs WHERE tag = "SID_ONLY_LINK_GENERATED" AND timestamp >= datetime(?, "unixepoch") ORDER BY timestamp DESC').bind(Math.floor(sevenDaysAgo/1000)).all()) as any;
		const sidOnlySessions = (sidOnlyRes.results || []).map((r: any) => r.sessionId);

		// D. Pinning Failures (7d)
		const pinFailuresRes = (await env.DB.prepare('SELECT sessionId FROM debug_logs WHERE tag = "RECOVERY_ACCOUNT_MISSING" AND timestamp >= datetime(?, "unixepoch") ORDER BY timestamp DESC').bind(Math.floor(sevenDaysAgo/1000)).all()) as any;
		const pinFailuresSessions = (pinFailuresRes.results || []).map((r: any) => r.sessionId);

		// E. IDB Errors (7d)
		const idbErrors = (await env.DB.prepare('SELECT COUNT(*) as count FROM debug_logs WHERE tag = "IDB_OPEN_FAILED" AND timestamp >= datetime(?, "unixepoch")').bind(Math.floor(sevenDaysAgo/1000)).first()) as any;

		// F. Stuck Videos (>10m processing)
		const tenMinAgo = now - 10 * 60 * 1000;
		const stuckVideos = (await env.DB.prepare('SELECT id, title, createdAt FROM videos WHERE status = "processing" AND createdAt < ? ORDER BY createdAt ASC LIMIT 20').bind(tenMinAgo).all()).results || [];

		// 5. Trace / Recent Events
		let recentEventsQuery = 'SELECT userId, type, sessionId, metadata, createdAt FROM metrics_events';
		let recentEventsParams: any[] = [];
		if (sessionIdFilter) {
			recentEventsQuery += ' WHERE sessionId = ?';
			recentEventsParams.push(sessionIdFilter);
		}
		recentEventsQuery += ' ORDER BY createdAt DESC LIMIT 50';
		const recentEvents = (await env.DB.prepare(recentEventsQuery).bind(...recentEventsParams).all()).results || [];

		let sessionLogs = [];
		if (sessionIdFilter) {
			const logsRes = (await env.DB.prepare('SELECT tag, data, source, timestamp FROM debug_logs WHERE sessionId = ? ORDER BY timestamp DESC').bind(sessionIdFilter).all()) as any;
			sessionLogs = logsRes.results || [];
		}

		return Response.json({
			type: sessionIdFilter ? 'session' : 'global',
			totalUsers: totalUsers?.count || 0,
			activeUsers: activeUsers?.count || 0,
			totalVideos: totalVideos?.count || 0,
			windowDays: 30,
			upload: {
				...uploadStats,
				successRate: (uploadStats.success + uploadStats.failed) > 0 ? Math.round((uploadStats.success / (uploadStats.success + uploadStats.failed)) * 100) : 100,
				topErrors: topUploadErrors,
				chunkFailures: {
					total: chunkFailuresTotal?.count || 0,
					topErrors: topChunkErrors
				}
			},
			playback: {
				...playbackStats,
				successRate: (playbackStats.started + playbackStats.failed) > 0 ? Math.round((playbackStats.started / (playbackStats.started + playbackStats.failed)) * 100) : 100,
				topErrors: topPlaybackErrors
			},
			infrastructure: {
				kvCache: {
					hits: kvHits?.count || 0,
					misses: kvMisses?.count || 0,
					hitRate: hitTotal > 0 ? Math.round(((kvHits?.count || 0) / hitTotal) * 100) : 0
				},
				sidOnlyLinks: {
					count: sidOnlySessions.length,
					recentSessions: sidOnlySessions.slice(0, 5)
				},
				accountPinningFailures: {
					count: pinFailuresSessions.length,
					recentSessions: pinFailuresSessions.slice(0, 5)
				},
				idbErrors: {
					count: idbErrors?.count || 0
				}
			},
			stuckVideos: {
				count: stuckVideos.length,
				items: stuckVideos
			},
			recentEvents,
			sessionLogs
		});
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function createVideo(request: Request, env: any) {
	let user: any;
	try {
		user = await getUserFromToken(request, env);
	} catch (err: any) {
		return jsonError(err.message, 'UNAUTHORIZED', 401);
	}
	try {
		const body = (await request.json()) as any;
		const { fileId, title, workspaceId, duration, accountEmail, sessionId } = body;
		
		await backendLog(env, user.id, "API_CREATE_VIDEO", {
			workspaceId,
			accountEmail,
			timestamp: Date.now()
		}, sessionId);

		if (!fileId || !workspaceId) {
			return jsonError('fileId and workspaceId are required', 'VALIDATION_ERROR');
		}

		// Enforce 500MB storage limit per user
		const STORAGE_LIMIT_BYTES = 500 * 1024 * 1024;
		const storageRow = (await env.DB.prepare('SELECT storageUsedBytes FROM users WHERE id = ?').bind(user.id).first()) as any;
		if ((storageRow?.storageUsedBytes || 0) >= STORAGE_LIMIT_BYTES) {
			return jsonError('Storage limit reached (500MB). Delete old recordings to free space.', 'STORAGE_LIMIT', 429);
		}

		// Validate workspace membership
		const membership = await env.DB.prepare('SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?')
			.bind(workspaceId, user.id)
			.first();

		if (!membership) {
			return jsonError('Unauthorized workspace access', 'FORBIDDEN', 403);
		}

		// Enforce usage limits
		const now = Date.now();
		const todayStart = new Date().setHours(0, 0, 0, 0);

		const stats = (await env.DB.prepare('SELECT lastRecordingAt FROM usage_stats WHERE userId = ? AND workspaceId = ?')
			.bind(user.id, workspaceId)
			.first()) as any;

		// 1. Cooldown (20s)
		if (stats?.lastRecordingAt && now - stats.lastRecordingAt < 20000) {
			const remaining = Math.ceil((20000 - (now - stats.lastRecordingAt)) / 1000);
			return jsonError(`Wait ${remaining} seconds before next recording`, 'USAGE_LIMIT', 429);
		}

		// 2. Max duration (10 mins)
		if (duration && duration > 600) {
			return jsonError('Usage limit reached', 'USAGE_LIMIT', 429);
		}

		// 3. Daily limit (100 recordings)
		const { count: dailyCount } = (await env.DB.prepare(
			'SELECT COUNT(*) as count FROM videos WHERE ownerId = ? AND createdAt >= ?'
		).bind(user.id, todayStart).first()) as any;

		if (dailyCount >= 100) {
			return jsonError('Daily recording limit reached (100). Please try again tomorrow.', 'USAGE_LIMIT', 429);
		}

		// Check if video exists
		const existing = (await env.DB.prepare('SELECT id, workspaceId, encryptedFileId, title, accountEmail FROM videos WHERE fileId = ?').bind(fileId).first()) as any;
		if (existing) {
			if (existing.workspaceId !== workspaceId) {
				return jsonError('Video already exists in another workspace', 'CONFLICT', 409);
			}
			const idToUse = existing.encryptedFileId || fileId;
			return Response.json({ 
				id: existing.id,
				encryptedFileId: existing.encryptedFileId,
				accountEmail: existing.accountEmail,
				playerUrl: `${PLAYER_BASE_URL}/?id=${idToUse}&title=${encodeURIComponent(existing.title || 'Recording')}`
			});
		}

		const id = crypto.randomUUID();
		const encryptedFileId = await encryptFileId(fileId, env);

		await env.DB.prepare(
			`INSERT INTO videos (id, fileId, encryptedFileId, title, ownerId, workspaceId, accountEmail, createdAt, updatedAt, duration, actualDurationMs, status, thumbnailUrl, sessionId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
			.bind(id, fileId, encryptedFileId, title, user.id, workspaceId, accountEmail, now, now, duration || 0, body.actualDurationMs || null, 'uploading', body.thumbnailUrl || null, sessionId || null)
			.run();

		await backendLog(env, user.id, 'FILEID_ENCRYPTED', { videoId: id, workspaceId });

		// Update lastRecordingAt to enforce cooldown for next attempt
		await env.DB.prepare(
			`INSERT INTO usage_stats (userId, workspaceId, lastRecordingAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(userId, workspaceId) DO UPDATE SET
           lastRecordingAt = excluded.lastRecordingAt,
           updatedAt = excluded.updatedAt`,
		)
			.bind(user.id, workspaceId, now, now, now)
			.run();

		console.log(JSON.stringify({ type: 'recording_started', userId: user.id, workspaceId, videoId: id, sessionId }));

		// Fire and forget (don't block main flow)
		recordEvent(env, { type: 'recording_started', userId: user.id, workspaceId, videoId: id, sessionId, metadata: { title } }).catch(() => {});

		return Response.json({
			id,
			encryptedFileId,
			accountEmail,
			playerUrl: `${PLAYER_BASE_URL}/?id=${encryptedFileId}&title=${encodeURIComponent(title || 'Recording')}${sessionId ? '&sid=' + sessionId : ''}`
		});
	} catch (err: any) {
		return jsonError(err.message);
	}
}

// Starts an R2 multipart upload for a new recording. The returned `key`
// is the final R2 object key for the whole recording's lifetime — unlike
// the old Drive flow there's no separate "placeholder" file to swap later.
async function initUpload(request: Request, env: any) {
	try {
		const user = await getUserFromToken(request, env);
		const body = (await request.json()) as any;
		const { workspaceId } = body;

		if (!workspaceId) return jsonError('workspaceId is required', 'VALIDATION_ERROR');

		const membership = await env.DB.prepare('SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?')
			.bind(workspaceId, user.id)
			.first();
		if (!membership) return jsonError('Unauthorized workspace access', 'FORBIDDEN', 403);

		const key = `videos/${workspaceId}/${crypto.randomUUID()}.webm`;
		const multipartUpload = await env.BUCKET.createMultipartUpload(key, {
			httpMetadata: { contentType: 'video/webm' },
		});

		return Response.json({ key, uploadId: multipartUpload.uploadId });
	} catch (err: any) {
		return jsonError(err.message);
	}
}

// Proxies one multipart part into R2. Body is the raw chunk bytes.
// R2 requires parts to be >=5MiB except the final one.
async function uploadPart(request: Request, env: any) {
	try {
		await getUserFromToken(request, env);
		const url = new URL(request.url);
		const key = url.searchParams.get('key');
		const uploadId = url.searchParams.get('uploadId');
		const partNumber = parseInt(url.searchParams.get('partNumber') || '', 10);

		if (!key || !uploadId || !partNumber) {
			return jsonError('key, uploadId and partNumber are required', 'VALIDATION_ERROR');
		}
		if (!request.body) return jsonError('Missing request body', 'VALIDATION_ERROR');

		const multipartUpload = env.BUCKET.resumeMultipartUpload(key, uploadId);
		const uploadedPart = await multipartUpload.uploadPart(partNumber, request.body);

		return Response.json({ partNumber: uploadedPart.partNumber, etag: uploadedPart.etag });
	} catch (err: any) {
		return jsonError(err.message);
	}
}

// Finalizes the R2 multipart upload. Metadata registration (the `videos`
// row) still happens via the existing POST /videos -> createVideo, with
// `fileId` set to this same `key` — reuses createVideo's usage-limit and
// workspace-membership checks instead of duplicating them here.
async function completeUpload(request: Request, env: any) {
	try {
		await getUserFromToken(request, env);
		const body = (await request.json()) as any;
		const { key, uploadId, parts } = body;

		if (!key || !uploadId || !Array.isArray(parts)) {
			return jsonError('key, uploadId and parts are required', 'VALIDATION_ERROR');
		}

		const multipartUpload = env.BUCKET.resumeMultipartUpload(key, uploadId);
		const object = await multipartUpload.complete(parts);

		return Response.json({ key, size: object.size });
	} catch (err: any) {
		return jsonError(err.message);
	}
}

// Cleans up an in-progress multipart upload that's being abandoned
// (e.g. the recording was discarded before finishing).
async function abortUpload(request: Request, env: any) {
	try {
		await getUserFromToken(request, env);
		const body = (await request.json()) as any;
		const { key, uploadId } = body;
		if (!key || !uploadId) return jsonError('key and uploadId are required', 'VALIDATION_ERROR');

		const multipartUpload = env.BUCKET.resumeMultipartUpload(key, uploadId);
		await multipartUpload.abort();

		return Response.json({ success: true });
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function getVideos(request: Request, env: any) {
	try {
		const user = await getUserFromToken(request, env);
		const url = new URL(request.url);
		const workspaceId = url.searchParams.get('workspaceId');
		const limit = parseInt(url.searchParams.get('limit') || '20');
		const cursor = url.searchParams.get('cursor');
		const folderId = url.searchParams.get('folderId');

		if (!workspaceId) {
			return jsonError('workspaceId is required', 'VALIDATION_ERROR');
		}

		// Verify workspace membership
		const membership = await env.DB.prepare('SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?')
			.bind(workspaceId, user.id)
			.first();

		if (!membership) {
			return jsonError('Unauthorized workspace access', 'FORBIDDEN', 403);
		}

		// Updated query to handle identity migration:
		// While getVideos currently returns all videos in a workspace,
		// we ensure the membership check (above) correctly resolves the user.
		let query = 'SELECT * FROM videos WHERE workspaceId = ? AND deletedAt IS NULL';
		let params: any[] = [workspaceId];

		if (folderId === 'unfiled') {
			query += ' AND folderId IS NULL';
		} else if (folderId) {
			query += ' AND folderId = ?';
			params.push(folderId);
		}

		if (cursor) {
			const [cTime, cId] = cursor.split(':');
			query += ' AND (createdAt < ? OR (createdAt = ? AND id < ?))';
			params.push(parseInt(cTime), parseInt(cTime), cId || '');
		}

		query += ' ORDER BY createdAt DESC, id DESC LIMIT ?';
		params.push(limit + 1);

		const { results } = await env.DB.prepare(query).bind(...params).all();

		// Construct playerUrl and sanitize sensitive fields
		const processedVideos = results.map((v: any) => {
			const { encryptedFileId, sessionId, fileId, ...rest } = v;
			// Player uses encrypted version
			const idToUse = encryptedFileId || fileId; 
			const encodedTitle = encodeURIComponent(v.title || 'Recording');
			
			let playerUrl = `${PLAYER_BASE_URL}/?id=${idToUse}&title=${encodedTitle}`;
			if (sessionId) playerUrl += `&sid=${sessionId}`;

			return {
				...rest,
				playerUrl
			};
		});

		const hasMore = processedVideos.length > limit;
		const videos = hasMore ? processedVideos.slice(0, limit) : processedVideos;
		const nextCursor = videos.length > 0 ? `${videos[videos.length - 1].createdAt}:${videos[videos.length - 1].id}` : null;

		return Response.json({
			videos,
			nextCursor,
			hasMore
		});
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function getVideo(request: Request, env: any) {
	try {
		const url = new URL(request.url);
		const id = url.pathname.split('/').filter(Boolean).pop();
		const sessionId = url.searchParams.get('sid');

		if (!id || id === 'videos') return jsonError('Video ID is required');

		// 1. Try direct ID lookup
		let video = (await env.DB.prepare('SELECT * FROM videos WHERE id = ? AND deletedAt IS NULL').bind(id).first()) as any;

		// 2. If not found, try encryptedFileId lookup
		if (!video) {
			video = (await env.DB.prepare('SELECT * FROM videos WHERE encryptedFileId = ? AND deletedAt IS NULL').bind(id).first()) as any;
		}

		if (!video) {
			await recordEvent(env, {
				type: 'video_not_found',
				userId: 'anonymous',
				workspaceId: 'public',
				metadata: { requestedId: id, sessionId }
			});
			return jsonError('Video not found', 'NOT_FOUND', 404);
		}

		// 3. Record Playback Event
		await recordEvent(env, {
			type: 'playback_started',
			userId: 'anonymous',
			workspaceId: video.workspaceId,
			videoId: video.id,
			sessionId: sessionId || video.sessionId
		});

		return Response.json(video);
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function updateVideo(request: Request, env: any) {
	try {
		const user = await getUserFromToken(request, env);
		const url = new URL(request.url);
		const id = url.pathname.split('/').filter(Boolean).pop();

		if (!id || id === 'videos') return jsonError('Video ID is required');

		const video = (await env.DB.prepare('SELECT ownerId, workspaceId, fileSizeBytes FROM videos WHERE id = ? AND deletedAt IS NULL')
			.bind(id)
			.first()) as any;

		if (!video) return jsonError('Video not found', 'NOT_FOUND', 404);

		// Verify workspace membership for any update
		const membership = await env.DB.prepare('SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?')
			.bind(video.workspaceId, user.id)
			.first();

		if (!membership) return jsonError('Unauthorized workspace access', 'FORBIDDEN', 403);

		const body = (await request.json()) as any;
		const { sessionId } = body;

		await backendLog(env, user.id, "API_UPDATE_VIDEO", {
			id,
			status: body.status,
			title: body.title,
			timestamp: Date.now()
		}, sessionId);

		// Only the video owner or workspace owner can perform a soft-delete
		if (body.delete === true && video.ownerId !== user.id && (membership as any).role !== 'owner') {
			return jsonError('Only the video owner or workspace owner can delete it', 'FORBIDDEN', 403);
		}
		const now = Date.now();

		let sets = ['updatedAt = ?'];
		let params: any[] = [now];

		// Moving a video to a different workspace requires membership in the
		// target workspace too. The R2 object key isn't tied to workspaceId
		// at read time (fileId is looked up verbatim), so no storage move is
		// needed — only the DB row's workspaceId changes.
		let targetWorkspaceId = video.workspaceId;
		const isMovingWorkspace = body.workspaceId && body.workspaceId !== video.workspaceId;
		if (isMovingWorkspace) {
			const targetMembership = await env.DB.prepare('SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?')
				.bind(body.workspaceId, user.id)
				.first();
			if (!targetMembership) return jsonError('You are not a member of the target workspace', 'FORBIDDEN', 403);

			targetWorkspaceId = body.workspaceId;
			sets.push('workspaceId = ?');
			params.push(targetWorkspaceId);
		}

		// A folder always belongs to a single workspace. Moving workspaces
		// without specifying a folder in the target workspace unfiles the video.
		if ('folderId' in body) {
			if (body.folderId) {
				const folder = (await env.DB.prepare('SELECT workspaceId FROM folders WHERE id = ?')
					.bind(body.folderId)
					.first()) as any;
				if (!folder) return jsonError('Folder not found', 'NOT_FOUND', 404);
				if (folder.workspaceId !== targetWorkspaceId) {
					return jsonError('Folder does not belong to the target workspace', 'VALIDATION_ERROR');
				}
				sets.push('folderId = ?');
				params.push(body.folderId);
			} else {
				sets.push('folderId = NULL');
			}
		} else if (isMovingWorkspace) {
			sets.push('folderId = NULL');
		}

		if (body.status) {
			sets.push('status = ?');
			params.push(body.status);
		}
		if (body.fileId) {
			sets.push('fileId = ?');
			params.push(body.fileId);
		}
		if (body.title) {
			sets.push('title = ?');
			params.push(body.title);
		}
		if ('thumbnailUrl' in body) {
			sets.push('thumbnailUrl = ?');
			params.push(body.thumbnailUrl);
		}
		if ('previewUrl' in body) {
			sets.push('previewUrl = ?');
			params.push(body.previewUrl);
		}
		if ('actualDurationMs' in body) {
			sets.push('actualDurationMs = ?');
			params.push(body.actualDurationMs);
		}
		if (body.fileSizeBytes) {
			sets.push('fileSizeBytes = ?');
			params.push(body.fileSizeBytes);
		}
		if (body.delete === true) {
			sets.push('deletedAt = ?');
			params.push(now);
		}
		if (sessionId) {
			sets.push('sessionId = ?');
			params.push(sessionId);
		}

		params.push(id);
		await env.DB.prepare(`UPDATE videos SET ${sets.join(', ')} WHERE id = ?`)
			.bind(...params)
			.run();

		if (body.status === 'ready') {
			// Only increment storage on first transition to ready (fileSizeBytes not yet set)
			if (body.fileSizeBytes > 0 && !video.fileSizeBytes) {
				await env.DB.prepare('UPDATE users SET storageUsedBytes = storageUsedBytes + ? WHERE id = ?')
					.bind(body.fileSizeBytes, user.id)
					.run();
			}
			console.log(JSON.stringify({ type: 'upload_success', userId: user.id, workspaceId: video.workspaceId, videoId: id, sessionId }));
			recordEvent(env, { type: 'upload_success', userId: user.id, workspaceId: video.workspaceId, videoId: id, sessionId }).catch(() => {});
		} else if (body.status === 'failed') {
			console.log(JSON.stringify({ type: 'upload_failed', userId: user.id, workspaceId: video.workspaceId, videoId: id, sessionId }));
			recordEvent(env, {
				type: 'upload_failed',
				userId: user.id,
				workspaceId: video.workspaceId,
				videoId: id,
				sessionId,
				metadata: { error: body.error },
			}).catch(() => {});
		}

		return Response.json({ success: true });
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function createFolder(request: Request, env: any) {
	try {
		const user = await getUserFromToken(request, env);
		const body = (await request.json()) as any;
		const workspaceId = body.workspaceId;
		const name = body.name?.trim();

		if (!workspaceId || !name) {
			return jsonError('workspaceId and name are required', 'VALIDATION_ERROR');
		}

		const membership = await env.DB.prepare('SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?')
			.bind(workspaceId, user.id)
			.first();
		if (!membership) return jsonError('Unauthorized workspace access', 'FORBIDDEN', 403);

		const id = crypto.randomUUID();
		const now = Date.now();
		await env.DB.prepare('INSERT INTO folders (id, workspaceId, name, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)')
			.bind(id, workspaceId, name, now, now)
			.run();

		return Response.json({ id, workspaceId, name, createdAt: now, updatedAt: now });
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function listFolders(request: Request, env: any) {
	try {
		const user = await getUserFromToken(request, env);
		const url = new URL(request.url);
		const workspaceId = url.searchParams.get('workspaceId');
		if (!workspaceId) return jsonError('workspaceId is required', 'VALIDATION_ERROR');

		const membership = await env.DB.prepare('SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?')
			.bind(workspaceId, user.id)
			.first();
		if (!membership) return jsonError('Unauthorized workspace access', 'FORBIDDEN', 403);

		const { results } = await env.DB.prepare('SELECT * FROM folders WHERE workspaceId = ? ORDER BY name ASC')
			.bind(workspaceId)
			.all();

		return Response.json({ folders: results });
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function renameFolder(request: Request, env: any) {
	try {
		const user = await getUserFromToken(request, env);
		const url = new URL(request.url);
		const id = url.pathname.split('/').filter(Boolean).pop();
		if (!id) return jsonError('Folder ID is required', 'VALIDATION_ERROR');

		const folder = (await env.DB.prepare('SELECT * FROM folders WHERE id = ?').bind(id).first()) as any;
		if (!folder) return jsonError('Folder not found', 'NOT_FOUND', 404);

		const membership = await env.DB.prepare('SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?')
			.bind(folder.workspaceId, user.id)
			.first();
		if (!membership) return jsonError('Unauthorized workspace access', 'FORBIDDEN', 403);

		const body = (await request.json()) as any;
		const name = body.name?.trim();
		if (!name) return jsonError('name is required', 'VALIDATION_ERROR');

		await env.DB.prepare('UPDATE folders SET name = ?, updatedAt = ? WHERE id = ?')
			.bind(name, Date.now(), id)
			.run();

		return Response.json({ success: true });
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function deleteFolder(request: Request, env: any) {
	try {
		const user = await getUserFromToken(request, env);
		const url = new URL(request.url);
		const id = url.pathname.split('/').filter(Boolean).pop();
		if (!id) return jsonError('Folder ID is required', 'VALIDATION_ERROR');

		const folder = (await env.DB.prepare('SELECT * FROM folders WHERE id = ?').bind(id).first()) as any;
		if (!folder) return jsonError('Folder not found', 'NOT_FOUND', 404);

		const membership = await env.DB.prepare('SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?')
			.bind(folder.workspaceId, user.id)
			.first();
		if (!membership) return jsonError('Unauthorized workspace access', 'FORBIDDEN', 403);

		// Videos in the folder aren't deleted — just unfiled
		await env.DB.prepare('UPDATE videos SET folderId = NULL WHERE folderId = ?').bind(id).run();
		await env.DB.prepare('DELETE FROM folders WHERE id = ?').bind(id).run();

		return Response.json({ success: true });
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function deleteVideo(request: Request, env: any) {
	try {
		const user = await getUserFromToken(request, env);
		const url = new URL(request.url);
		const id = url.pathname.split('/').filter(Boolean).pop();

		console.log(`[SV][DELETE_VIDEO] Attempting to delete video: ${id} by user: ${user.email}`);

		if (!id) return jsonError('Video ID is required', 'VALIDATION_ERROR');

		const video = (await env.DB.prepare('SELECT ownerId, workspaceId, title, fileId, fileSizeBytes, storageProvider FROM videos WHERE id = ?').bind(id).first()) as any;

		if (!video) {
			console.warn(`[SV][DELETE_VIDEO] Video not found: ${id}`);
			return jsonError('Video not found', 'NOT_FOUND', 404);
		}

		// Check permission
		const membership = (await env.DB.prepare('SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?')
			.bind(video.workspaceId, user.id)
			.first()) as any;

		if (video.ownerId !== user.id && (!membership || membership.role !== 'owner')) {
			console.warn(`[SV][DELETE_VIDEO] Permission denied for user: ${user.email} on video: ${id}`);
			return jsonError('Only the video owner or workspace owner can delete it', 'FORBIDDEN', 403);
		}

		if (video.fileId && video.storageProvider === 'r2') {
			console.log(`[SV][DELETE_VIDEO] Performing R2 deletion for key`);
			env.BUCKET.delete(video.fileId).catch((err: any) => console.error("[SV][DELETE_VIDEO] R2 delete failed:", err));
		}

		await env.DB.prepare('UPDATE videos SET deletedAt = ? WHERE id = ?').bind(Date.now(), id).run();
		if (video.fileSizeBytes > 0) {
			await env.DB.prepare('UPDATE users SET storageUsedBytes = MAX(0, storageUsedBytes - ?) WHERE id = ?')
				.bind(video.fileSizeBytes, user.id)
				.run();
		}
		console.log(`[SV][DELETE_VIDEO] Successfully soft-deleted video: ${video.title} (${id})`);

		return Response.json({ success: true });
	} catch (err: any) {
		console.error(`[SV][DELETE_VIDEO] Unexpected error: ${err.message}`);
		return jsonError(err.message);
	}
}


async function updateUsage(request: Request, env: any) {
	let user: any;
	try {
		user = await getUserFromToken(request, env);
	} catch (err: any) {
		return jsonError(err.message, 'UNAUTHORIZED', 401);
	}
	try {
		const body = (await request.json()) as any;
		const { workspaceId, duration, recordedAt } = body;

		if (!workspaceId) {
			return jsonError('workspaceId is required', 'VALIDATION_ERROR');
		}

		// Validate workspace membership
		const membership = await env.DB.prepare('SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?')
			.bind(workspaceId, user.id)
			.first();

		if (!membership) {
			return jsonError('Unauthorized workspace access', 'FORBIDDEN', 403);
		}

		const now = Date.now();
		// Update or Insert usage stats (idempotent UPSERT)
		await env.DB.prepare(
			`INSERT INTO usage_stats (userId, workspaceId, recordingsCount, totalDuration, lastRecordingAt, createdAt, updatedAt)
       VALUES (?, ?, 1, ?, ?, ?, ?)
       ON CONFLICT(userId, workspaceId) DO UPDATE SET
           recordingsCount = recordingsCount + 1,
           totalDuration = totalDuration + excluded.totalDuration,
           lastRecordingAt = excluded.lastRecordingAt,
           updatedAt = excluded.updatedAt`,
		)
			.bind(user.id, workspaceId, duration || 0, recordedAt || now, now, now)
			.run();

		return Response.json({ success: true });
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function createInvite(request: Request, env: any) {
	try {
		const user = await getUserFromToken(request, env);
		const body = (await request.json()) as any;
		const { workspaceId, role } = body;

		if (!workspaceId) {
			return jsonError('workspaceId is required', 'VALIDATION_ERROR');
		}

		// Verify user is workspace owner
		const workspace = (await env.DB.prepare('SELECT id FROM workspaces WHERE id = ? AND ownerId = ?')
			.bind(workspaceId, user.id)
			.first()) as any;

		if (!workspace) {
			return jsonError('Invalid workspace or permission denied', 'FORBIDDEN', 403);
		}

		const now = Date.now();

		// Check active invite limit (10)
		const { count } = (await env.DB.prepare(
			'SELECT COUNT(*) as count FROM invites WHERE workspaceId = ? AND revokedAt IS NULL AND (expiresAt IS NULL OR expiresAt > ?)',
		)
			.bind(workspaceId, now)
			.first()) as any;

		if (count >= 10) {
			await backendLog(env, user.id, 'INVITE_LIMIT_REACHED', { workspaceId, count });
			return jsonError('Maximum active invites reached (limit: 10)', 'USAGE_LIMIT', 429);
		}

		const id = crypto.randomUUID();
		const token = crypto.randomUUID(); // Random token as requested
		const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days expiry
		const inviteRole = role === 'owner' ? 'owner' : 'member';

		await env.DB.prepare(
			`INSERT INTO invites (id, workspaceId, token, role, createdAt, expiresAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
		)
			.bind(id, workspaceId, token, inviteRole, now, expiresAt)
			.run();

		await backendLog(env, user.id, 'INVITE_TOKEN_CREATED', {
			workspaceId,
			inviteId: id,
			role: inviteRole,
			expiresAt,
			timestamp: now
		});

		return Response.json({
			token,
			joinUrl: `${PLAYER_BASE_URL}/#/invite/${token}`,
			expiresAt,
			role: inviteRole
		});
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function listWorkspaceInvites(request: Request, env: any) {
	try {
		const user = await getUserFromToken(request, env);
		const url = new URL(request.url);
		const workspaceId = url.searchParams.get('workspaceId');

		if (!workspaceId) {
			return jsonError('workspaceId is required', 'VALIDATION_ERROR');
		}

		// Verify membership
		const membership = await env.DB.prepare('SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?')
			.bind(workspaceId, user.id)
			.first();

		if (!membership) {
			return jsonError('Unauthorized workspace access', 'FORBIDDEN', 403);
		}

		const { results } = await env.DB.prepare(
			`SELECT id, token, role, createdAt, expiresAt, revokedAt 
       FROM invites 
       WHERE workspaceId = ? 
       ORDER BY createdAt DESC`,
		)
			.bind(workspaceId)
			.all();

		return Response.json(results || []);
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function revokeInvite(request: Request, env: any) {
	try {
		const user = await getUserFromToken(request, env);
		const body = (await request.json()) as any;
		const { inviteId } = body;

		if (!inviteId) {
			return jsonError('inviteId is required', 'VALIDATION_ERROR');
		}

		const invite = (await env.DB.prepare('SELECT workspaceId FROM invites WHERE id = ?').bind(inviteId).first()) as any;
		if (!invite) return jsonError('Invite not found', 'NOT_FOUND', 404);

		// Verify user is owner of the workspace
		const membership = (await env.DB.prepare('SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?')
			.bind(invite.workspaceId, user.id)
			.first()) as any;

		if (!membership || membership.role !== 'owner') {
			return jsonError('Only workspace owners can revoke invites', 'FORBIDDEN', 403);
		}

		const now = Date.now();
		await env.DB.prepare('UPDATE invites SET revokedAt = ? WHERE id = ?')
			.bind(now, inviteId)
			.run();

		await backendLog(env, user.id, 'INVITE_REVOKED', {
			inviteId,
			workspaceId: invite.workspaceId,
			timestamp: now
		});

		return Response.json({ success: true });
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function logInviteCopy(request: Request, env: any) {
	try {
		const user = await getUserFromToken(request, env);
		const body = (await request.json()) as any;
		const { inviteId, token } = body;

		await backendLog(env, user.id, 'INVITE_LINK_COPIED', {
			inviteId,
			token: token ? token.slice(0, 8) + '...' : 'unknown',
			timestamp: Date.now()
		});

		return Response.json({ success: true });
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function listWorkspaces(request: Request, env: any) {
	try {
		const user = await getUserFromToken(request, env);
		const { results } = await env.DB.prepare(
			`SELECT w.id, w.name, w.slug, m.role, w.ownerId, w.driveFolderId 
       FROM workspaces w
       JOIN workspace_members m ON w.id = m.workspaceId
       WHERE m.userId = ?
       ORDER BY m.joinedAt ASC`,
		)
			.bind(user.id)
			.all();

		return Response.json({ workspaces: results });
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function joinWorkspace(request: Request, env: any) {
	try {
		const user = await getUserFromToken(request, env);
		const body = (await request.json()) as any;
		const { token } = body; // Changed from inviteKey to token

		if (!token) {
			return jsonError('token is required', 'VALIDATION_ERROR');
		}

		const now = Date.now();

		// Validate token
		const invite = (await env.DB.prepare('SELECT * FROM invites WHERE token = ?').bind(token).first()) as any;

		if (!invite) {
			return jsonError('Invite invalid', 'NOT_FOUND', 404);
		}

		if (invite.revokedAt) {
			await backendLog(env, user.id, 'INVITE_TOKEN_REJECTED', { token, reason: 'revoked', workspaceId: invite.workspaceId });
			return jsonError('Invite revoked', 'FORBIDDEN', 403);
		}

		if (invite.expiresAt && invite.expiresAt < now) {
			await backendLog(env, user.id, 'INVITE_TOKEN_REJECTED', { token, reason: 'expired', workspaceId: invite.workspaceId });
			return jsonError('Invite expired', 'FORBIDDEN', 403);
		}

		// Insert into workspace_members (idempotent)
		// Inherit role from invite
		const role = invite.role || 'member';

		await env.DB.prepare(
			`INSERT OR IGNORE INTO workspace_members (userId, workspaceId, role, joinedAt)
       VALUES (?, ?, ?, ?)`,
		)
			.bind(user.id, invite.workspaceId, role, now)
			.run();

		await backendLog(env, user.id, 'INVITE_TOKEN_VALIDATED', {
			token,
			workspaceId: invite.workspaceId,
			role,
			timestamp: now
		});

		return Response.json({
			success: true,
			workspaceId: invite.workspaceId,
		});
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function leaveWorkspace(request: Request, env: any) {
	try {
		const user = await getUserFromToken(request, env);
		const body = (await request.json()) as any;
		const { workspaceId } = body;

		if (!workspaceId) {
			return jsonError('workspaceId is required', 'VALIDATION_ERROR');
		}

		// Verify membership and role
		const membership = (await env.DB.prepare('SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?')
			.bind(workspaceId, user.id)
			.first()) as any;

		if (!membership) {
			return jsonError('Not a member of this workspace', 'NOT_FOUND', 404);
		}

		if (membership.role === 'owner') {
			return jsonError('Owners cannot leave their own workspace', 'FORBIDDEN', 403);
		}

		// Remove membership
		await env.DB.prepare('DELETE FROM workspace_members WHERE workspaceId = ? AND userId = ?').bind(workspaceId, user.id).run();

		return Response.json({ success: true });
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function handleGoogleAuth(request: Request, env: any) {
	try {
		const body = (await request.json()) as any;
		const { accessToken } = body;

		if (!accessToken) {
			return jsonError('Missing accessToken', 'AUTH_ERROR');
		}

		// 🔐 Verify token via Google API
		const googleRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		if (!googleRes.ok) {
			return jsonError('Invalid access token', 'AUTH_ERROR');
		}

		const googleUser = (await googleRes.json()) as any;
		const googleSub = googleUser.id;
		const email = googleUser.email;
		const name = googleUser.name;
		const picture = googleUser.picture;

		if (!googleSub || !email) {
			return jsonError('Invalid user data from Google', 'AUTH_ERROR');
		}

		const now = Date.now();

		// 1. Check if this Google account is already linked (Idempotent / Duplicate Handling)
		const linked = (await env.DB.prepare('SELECT userId FROM linked_accounts WHERE googleSub = ?')
			.bind(googleSub)
			.first()) as any;

		let userId: string;

		if (linked) {
			// Account already linked to a user - return existing user (Idempotent)
			userId = linked.userId;
		} else {
			// 2. Account not linked. Secure Linking: ONLY link if user is verified.
			const authHeader = request.headers.get('Authorization');
			let currentUser: any = null;

			if (authHeader) {
				try {
					// Verify Authorization token
					currentUser = await getUserFromToken(request, env);
				} catch (e: any) {
					// If token is present but invalid, FAIL linking (Security)
					return jsonError(e.message, 'UNAUTHORIZED', 401);
				}
			}

			if (currentUser) {
				// CASE B: Authenticated Link - Link new account to existing user
				userId = currentUser.id;
			} else {
				// CASE A: Fresh Login - No existing session
				// check for legacy user (where id was googleSub)
				const legacyUser = (await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(googleSub).first()) as any;

				if (legacyUser) {
					userId = legacyUser.id;
				} else {
					// Truly new user
					userId = crypto.randomUUID();
					await env.DB.prepare(
						`INSERT INTO users (id, email, name, picture, createdAt, updatedAt, lastLoginAt)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
					)
						.bind(userId, email, name, picture, now, now, now)
						.run();
				}
			}

			// Create the link (idempotent check via googleSub UNIQUE)
			await env.DB.prepare(
				'INSERT OR IGNORE INTO linked_accounts (id, userId, email, googleSub, createdAt) VALUES (?, ?, ?, ?, ?)',
			)
				.bind(crypto.randomUUID(), userId, email, googleSub, now)
				.run();
		}

		// 🟢 Update last login
		await env.DB.prepare(`UPDATE users SET lastLoginAt = ?, updatedAt = ? WHERE id = ?`).bind(now, now, userId).run();

		// 🟢 MIGRATION (Safe & Idempotent)
		const userRecord = (await env.DB.prepare('SELECT migrated FROM users WHERE id = ?').bind(userId).first()) as any;

		if (userRecord && userRecord.migrated === 0) {
			console.log("Migration started for user:", userId);
			try {
				await env.DB.batch([
					// STEP A — UPDATE WORKSPACES (Migrate legacy ownership)
					env.DB.prepare(`
						UPDATE workspaces 
						SET ownerId = ?, updatedAt = ? 
						WHERE ownerId IN (SELECT googleSub FROM linked_accounts WHERE userId = ?)
						AND ownerId != ?
					`).bind(userId, now, userId, userId),
					
					// STEP B — UPDATE VIDEOS (Migrate legacy ownership)
					env.DB.prepare(`
						UPDATE videos 
						SET ownerId = ?, updatedAt = ? 
						WHERE ownerId IN (SELECT googleSub FROM linked_accounts WHERE userId = ?)
						AND ownerId != ?
					`).bind(userId, now, userId, userId),
					
					// STEP C — MARK USER AS MIGRATED
					env.DB.prepare('UPDATE users SET migrated = 1, updatedAt = ? WHERE id = ?')
						.bind(now, userId)
				]);
				console.log("Migration completed for user:", userId);
			} catch (err) {
				console.error("Migration failed for user:", userId, err);
				// D1 batch() handles the rollback automatically if any statement fails
			}
		}

		// 🟢 WORKSPACE RESOLUTION (Post-Migration)
		let workspace = (await env.DB.prepare('SELECT * FROM workspaces WHERE ownerId = ?').bind(userId).first()) as any;
		
		if (!workspace) {
			const workspaceId = crypto.randomUUID();
			const slug = generateSlug(email) + '-' + userId.slice(0, 6);

			await env.DB.prepare(
				`INSERT INTO workspaces (id, slug, ownerId, name, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
			)
				.bind(workspaceId, slug, userId, name || email, now, now)
				.run();

			workspace = { id: workspaceId, slug };
		}

		// 🟢 MEMBERSHIP (idempotent owner addition)
		await env.DB.prepare(
			`INSERT OR IGNORE INTO workspace_members (userId, workspaceId, role, joinedAt)
       VALUES (?, ?, ?, ?)`,
		)
			.bind(userId, workspace.id, 'owner', now)
			.run();

		// 🟢 USAGE INIT
		await env.DB.prepare(
			`INSERT OR IGNORE INTO usage_stats (userId, workspaceId, createdAt)
       VALUES (?, ?, ?)`,
		)
			.bind(userId, workspace.id, now)
			.run();

		// 🟢 Resolve active workspace via membership
		const activeMembership = (await env.DB.prepare('SELECT workspaceId, role FROM workspace_members WHERE userId = ? ORDER BY joinedAt DESC')
			.bind(userId)
			.first()) as any;

		const resolvedWorkspaceId = activeMembership?.workspaceId || workspace.id;
		const resolvedRole = activeMembership?.role || 'owner';

		// Fetch slug for the resolved workspace
		const resolvedWorkspace = (await env.DB.prepare('SELECT slug FROM workspaces WHERE id = ?').bind(resolvedWorkspaceId).first()) as any;

		return Response.json({
			userId,
			email,
			workspaceId: resolvedWorkspaceId,
			workspaceSlug: resolvedWorkspace?.slug || workspace.slug,
			workspaceRole: resolvedRole,
		});
	} catch (err: any) {
		return jsonError(err.message, 'AUTH_ERROR');
	}
}

function generateSlug(email: string) {
	return email
		.split('@')[0]
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '-');
}

function jsonError(message: string, code: string = 'API_ERROR', status: number = 400) {
	return new Response(
		JSON.stringify({
			error: message,
			code,
		}),
		{ status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
	);
}

async function getUserFromToken(request: Request, env: Env) {
	const authHeader = request.headers.get('Authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		throw new Error('Missing Authorization header');
	}

	const token = authHeader.split(' ')[1];
	const now = Date.now();
	
	// Read from KV (Distributed Cache)
	const cached = await env.TOKEN_CACHE.get(token, 'json') as { user: any; expiresAt: number } | null;
	
	if (cached && cached.expiresAt > now) {
		backendLog(env, cached.user.id, "KV_CACHE_HIT", { source: "kv" });
		return cached.user;
	}

	backendLog(env, undefined, "KV_CACHE_MISS", { reason: cached ? "expired" : "missing" });

	const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
		headers: {
			Authorization: `Bearer ${token}`,
		},
	});

	if (!res.ok) {
		// Stale fallback: only allow if cached entry is less than 20 minutes old
		// (cached.expiresAt is created_at + 10m, so 20m old is expiresAt + 10m)
		if (cached && (now - cached.expiresAt < 10 * 60 * 1000)) {
			console.warn("Google API failed, using stale cache (within 20min limit)");
			return cached.user;
		}
		throw new Error('Invalid access token');
	}

	const user = (await res.json()) as any;
	const googleSub = user.id;

	// Resolve internal userId via linked_accounts
	const linked = (await env.DB.prepare('SELECT userId FROM linked_accounts WHERE googleSub = ?')
		.bind(googleSub)
		.first()) as any;
	
	let userId = linked?.userId;

	if (!userId) {
		// Fallback to legacy check (where id was googleSub)
		const legacyUser = (await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(googleSub).first()) as any;
		userId = legacyUser?.id;
	}

	if (!userId) {
		throw new Error('User not found. Please sign in again.');
	}

	const userInfo = {
		id: userId,
		email: user.email,
		name: user.name,
		picture: user.picture,
	};
	
	// Write to KV: TTL 10 minutes (600s), but persist for fallback
	// Instruction said TTL 600, but to support 20m fallback we use 1200
	await env.TOKEN_CACHE.put(
		token,
		JSON.stringify({ user: userInfo, expiresAt: now + 10 * 60 * 1000 }),
		{ expirationTtl: 1200 }
	);
	return userInfo;
}

async function joinWaitlist(request: Request, env: any) {
	try {
		const body = (await request.json()) as any;
		const email = (body.email || '').trim().toLowerCase();
		if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return jsonError('Valid email required', 'VALIDATION_ERROR');
		}
		const now = Date.now();
		await env.DB.prepare(
			'INSERT OR IGNORE INTO waitlist (id, email, createdAt) VALUES (?, ?, ?)'
		).bind(crypto.randomUUID(), email, now).run();
		console.log(`[SV][WAITLIST] ${email}`);
		return Response.json({ success: true });
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function getAccount(request: Request, env: any) {
	try {
		const user = await getUserFromToken(request, env);
		const row = (await env.DB.prepare('SELECT storageUsedBytes FROM users WHERE id = ?').bind(user.id).first()) as any;
		const storageUsedBytes = row?.storageUsedBytes || 0;
		const storageLimitBytes = 500 * 1024 * 1024;
		return Response.json({
			storageUsedBytes,
			storageLimitBytes,
			storageRemainingBytes: Math.max(0, storageLimitBytes - storageUsedBytes),
		});
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function getMetricsSummary(request: Request, env: any) {
	try {
		const user = await getUserFromToken(request, env);
		const url = new URL(request.url);
		const workspaceId = url.searchParams.get('workspaceId');

		if (!workspaceId) {
			return jsonError('workspaceId is required', 'VALIDATION_ERROR');
		}

		// Verify workspace membership and role (Only owner can see metrics)
		const membership = (await env.DB.prepare('SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?')
			.bind(workspaceId, user.id)
			.first()) as any;

		if (!membership || membership.role !== 'owner') {
			return jsonError('Unauthorized workspace access (Owner only)', 'FORBIDDEN', 403);
		}

		const stats = (await env.DB.prepare(
			`SELECT 
				COUNT(DISTINCT CASE WHEN type = 'recording_started' THEN sessionId ELSE NULL END) as totalRecordings,
				COUNT(DISTINCT CASE WHEN type = 'upload_success' THEN sessionId ELSE NULL END) as successCount,
				COUNT(DISTINCT CASE WHEN type = 'upload_failed' THEN sessionId ELSE NULL END) as totalFailures,
				COUNT(DISTINCT userId) as activeUsers
			FROM metrics_events
			WHERE workspaceId = ?`,
		)
			.bind(workspaceId)
			.first()) as any;

		return Response.json({
			workspaceId,
			...stats,
		});
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function recordEvent(env: any, data: { type: string; userId: string; workspaceId: string; videoId?: string; sessionId?: string; metadata?: any }) {
	try {
		const id = crypto.randomUUID();
		const now = Date.now();
		const metadataStr = JSON.stringify(data.metadata || {});

		// Ensure we are binding strings or nulls to the correct columns
		// Table schema: id (0), type (1), userId (2), workspaceId (3), videoId (4), metadata (5), createdAt (6), sessionId (7)
		const bindValues = [
			id,
			String(data.type),
			String(data.userId || 'anonymous'),
			String(data.workspaceId || 'public'),
			data.videoId ? String(data.videoId) : null,
			metadataStr,
			now,
			data.sessionId ? String(data.sessionId) : null,
		];

		await env.DB.prepare('INSERT INTO metrics_events (id, type, userId, workspaceId, videoId, metadata, createdAt, sessionId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
			.bind(...bindValues)
			.run();
	} catch (e: any) {
		console.error('Failed to record event:', e.message, JSON.stringify(data));
	}
}
async function listWorkspaceMembers(request: Request, env: any) {
	try {
		const user = await getUserFromToken(request, env);
		const url = new URL(request.url);
		const workspaceId = url.searchParams.get('workspaceId');

		if (!workspaceId) {
			return jsonError('workspaceId is required', 'VALIDATION_ERROR');
		}

		// Verify membership
		const membership = await env.DB.prepare('SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?')
			.bind(workspaceId, user.id)
			.first();

		if (!membership) {
			return jsonError('Unauthorized workspace access', 'FORBIDDEN', 403);
		}

		const { results } = await env.DB.prepare(
			`SELECT users.id as userId, users.email, workspace_members.role
       FROM workspace_members
       JOIN users ON users.id = workspace_members.userId
       WHERE workspace_members.workspaceId = ?`,
		)
			.bind(workspaceId)
			.all();

		return Response.json(results || []);
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function removeMember(request: Request, env: any) {
	try {
		const currentUser = await getUserFromToken(request, env);
		const url = new URL(request.url);
		const userIdToRemove = url.pathname.split('/').pop();
		const workspaceId = url.searchParams.get('workspaceId');

		if (!userIdToRemove || !workspaceId) {
			return jsonError('userId and workspaceId are required', 'VALIDATION_ERROR');
		}

		// Check currentUser's role
		const membership = (await env.DB.prepare('SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ?')
			.bind(workspaceId, currentUser.id)
			.first()) as any;

		if (!membership || membership.role !== 'owner') {
			return jsonError('Only owners can remove members', 'FORBIDDEN', 403);
		}

		if (userIdToRemove === currentUser.id) {
			return jsonError('Owners cannot remove themselves', 'BAD_REQUEST', 400);
		}

		await env.DB.prepare('DELETE FROM workspace_members WHERE workspaceId = ? AND userId = ?')
			.bind(workspaceId, userIdToRemove)
			.run();

		return Response.json({ success: true });
	} catch (err: any) {
		return jsonError(err.message);
	}
}
async function updateWorkspace(request: Request, env: any) {
	try {
		const user = await getUserFromToken(request, env);
		const url = new URL(request.url);
		const workspaceId = url.pathname.split('/').pop();
		const body = (await request.json()) as any;

		const workspace = (await env.DB.prepare('SELECT ownerId FROM workspaces WHERE id = ?').bind(workspaceId).first()) as any;
		if (!workspace || workspace.ownerId !== user.id) {
			return jsonError('Only the workspace owner can update settings', 'FORBIDDEN', 403);
		}

		if (body.driveFolderId) {
			await env.DB.prepare('UPDATE workspaces SET driveFolderId = ? WHERE id = ?').bind(body.driveFolderId, workspaceId).run();
		}

		return Response.json({ success: true });
	} catch (err: any) {
		return jsonError(err.message);
	}
}
async function updateAccount(request: Request, env: any) {
	try {
		const user = await getUserFromToken(request, env);
		const url = new URL(request.url);
		const accountId = url.pathname.split('/').pop();
		const body = (await request.json()) as any;

		if (body.driveRootFolderId) {
			await env.DB.prepare('UPDATE linked_accounts SET driveRootFolderId = ? WHERE googleSub = ? AND userId = ?')
				.bind(body.driveRootFolderId, accountId, user.id)
				.run();
		}

		return Response.json({ success: true });
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function handleExtensionLogs(request: Request, env: any) {
	let user: any;
	try {
		user = await getUserFromToken(request, env);
	} catch (err: any) {
		return jsonError(err.message, 'UNAUTHORIZED', 401);
	}

	try {
		const body = (await request.json()) as any;
		const { tag, data, sessionId } = body;

		console.log(`[EXT][${tag}][${user.email}]${sessionId ? ' [' + sessionId + ']' : ''}`, JSON.stringify(data));

		try {
			const result = await env.DB.prepare('INSERT INTO debug_logs (userId, tag, data, source, sessionId) VALUES (?, ?, ?, ?, ?)')
				.bind(user.id, tag, JSON.stringify(data), 'extension', sessionId || null)
				.run();
			console.log("[SV][LOG_PERSIST_SUCCESS]", { id: result.meta?.last_row_id });
		} catch (e: any) {
			console.error("[SV][LOG_PERSIST_ERROR]", e.message, { userId: user.id, tag });
		}

		return Response.json({ success: true });
	} catch (err: any) {
		return jsonError(err.message);
	}
}

async function backendLog(env: any, userId: string | null | undefined, tag: string, data: any, sessionId?: string) {
	try {
		console.log(`[SV][${tag}]${sessionId ? ' [' + sessionId + ']' : ''}`, JSON.stringify(data));
		await env.DB.prepare('INSERT INTO debug_logs (userId, tag, data, source, sessionId) VALUES (?, ?, ?, ?, ?)')
			.bind(userId, tag, JSON.stringify(data), 'backend', sessionId || null)
			.run();
	} catch (e) {
		console.error("Failed to persist backend log:", e);
	}
}
async function migrateFileIds(request: Request, env: Env) {
	try {
		const user = await getUserFromToken(request, env);
		// Admin only
		if (!isAdmin(user.email, env)) {
			return jsonError('Unauthorized', 'UNAUTHORIZED', 401);
		}

		const { results } = await env.DB.prepare('SELECT id, fileId FROM videos WHERE encryptedFileId IS NULL').all();
		
		let migrated = 0;
		let failed = 0;

		for (const video of results as any[]) {
			try {
				const encrypted = await encryptFileId(video.fileId, env);
				await env.DB.prepare('UPDATE videos SET encryptedFileId = ? WHERE id = ?')
					.bind(encrypted, video.id)
					.run();
				migrated++;
			} catch (e) {
				console.error(`Migration failed for video ${video.id}:`, e);
				failed++;
			}
		}

		return Response.json({
			success: true,
			migrated,
			failed,
			total: results.length
		});
	} catch (err: any) {
		return jsonError(err.message);
	}
}

const PLAYER_BASE_URL = 'https://screenvault.tushar-abf.workers.dev';

/**
 * ENCRYPTION UTILITIES (AES-256-GCM)
 * Securely encrypts/decrypts Google Drive file IDs.
 */

async function getEncryptionKey(encryptionKey: string): Promise<CryptoKey> {
	// Pad/slice to 32 bytes for AES-256
	const enc = new TextEncoder();
	const keyData = enc.encode(encryptionKey.padEnd(32, '0').slice(0, 32));
	return await crypto.subtle.importKey('raw', keyData, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptFileId(rawFileId: string, env: any): Promise<string> {
	if (!env.ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY not configured');
	const key = await getEncryptionKey(env.ENCRYPTION_KEY);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encoded = new TextEncoder().encode(rawFileId);

	const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

	// Combine IV and Ciphertext
	const combined = new Uint8Array(iv.length + encrypted.byteLength);
	combined.set(iv);
	combined.set(new Uint8Array(encrypted), iv.length);

	// Base64Url safe encoding
	return btoa(String.fromCharCode(...combined)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function decryptFileId(encryptedBase64: string, env: any): Promise<string> {
	if (!env.ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY not configured');
	const key = await getEncryptionKey(env.ENCRYPTION_KEY);

	// Normalize base64
	let base64 = encryptedBase64.replace(/-/g, '+').replace(/_/g, '/');
	while (base64.length % 4) base64 += '=';

	const combined = new Uint8Array(
		atob(base64)
			.split('')
			.map((c) => c.charCodeAt(0))
	);
	const iv = combined.slice(0, 12);
	const data = combined.slice(12);

	const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
	return new TextDecoder().decode(decrypted);
}
