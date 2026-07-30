export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS, POST",
      "Access-Control-Allow-Headers": "Content-Type, Range, Authorization, Accept-Ranges, X-Requested-With",
      "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
      "Vary": "Origin"
    };

    console.log(`[SV][REQUEST] ${request.method} ${request.url}`);

    // 1. Handle OPTIONS globally
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sid");

    // 1. Telemetry Route (Record client-side events)
    if (url.pathname === "/event" && request.method === "POST") {
      try {
        const body = await request.json() as any;
        await recordPlaybackEvent(env, body);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    const rawEncryptedId = url.searchParams.get("id");
    let fileId = rawEncryptedId;

    if (!fileId) {
       return new Response("Missing fileId", { status: 400, headers: corsHeaders });
    }

    // Try to decrypt if it looks like an encrypted ID
    // Encrypted IDs are > 60 chars (IV + encrypted data). Raw IDs are ~33.
    let decryptError = null;
    let isDecrypted = false;
    if (fileId && fileId.length > 50) {
      try {
        fileId = await decryptFileId(fileId, env.ENCRYPTION_KEY);
        isDecrypted = true;
      } catch (e: any) {
        decryptError = e.message;
        console.warn("Decryption failed:", e);
        await recordPlaybackEvent(env, {
          type: 'decrypt_failed',
          sessionId,
          metadata: { errorCode: 'PLAYBACK_DECRYPT_FAILED', errorMessage: e.message, encryptedFileId: rawEncryptedId?.slice(0, 8) + '...' }
        }, { dedupe: true });
      }
    }

    console.log(`[SV][FETCH_START] Decrypted: ${isDecrypted}, Key: ${fileId?.slice(0, 8)}..., Session: ${sessionId || 'none'}`);

    // Resolve videoId and workspaceId for linkage.
    const video = (await env.DB.prepare('SELECT id, title, workspaceId, ownerId, actualDurationMs, fileId FROM videos WHERE fileId = ? OR encryptedFileId = ?')
      .bind(fileId, rawEncryptedId)
      .first()) as any;

    const commonMeta = {
      videoId: video?.id,
      workspaceId: video?.workspaceId,
      userId: video?.ownerId,
      sessionId,
      userAgent: request.headers.get("User-Agent")
    };

    // STRICT DECRYPTION: If we attempted decryption and it failed, reject immediately.
    // We no longer rely on the database as a fallback for finding the raw ID.
    if (decryptError) {
        console.error(`[SV][AUTH_FAILED] Strict decryption failed for ID: ${rawEncryptedId?.slice(0, 16)}...`);
        return new Response("Invalid encrypted token", { status: 403, headers: corsHeaders });
    }

    // 2. Metadata Route (Resolves video title from DB or generates a fallback)
    if (url.pathname === "/meta") {
      if (video && video.title) {
        return new Response(JSON.stringify({
          name: video.title,
          actualDurationMs: video.actualDurationMs
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ name: `Recording ${new Date().toLocaleDateString()}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 3. Main Route (Streaming / Health Check)
    if (request.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Accept-Ranges": "bytes",
          "Content-Type": "video/webm",
          "X-SV-Version": "3.0-r2"
        }
      });
    }

    // Handle GET (stream from R2)
    try {
      const rangeHeader = request.headers.get("Range");

      // ONLY log playback_started for the initial request (not for every byte-range request)
      if (!rangeHeader || rangeHeader === 'bytes=0-') {
        await recordPlaybackEvent(env, {
          type: 'playback_started',
          ...commonMeta
        }, { dedupe: true });
      }

      const r2Range = parseRangeHeader(rangeHeader);
      console.log(`[SV][R2_FETCH] Key: ${fileId?.slice(0, 8)}..., Range: ${rangeHeader || 'none'}`);

      const object = await env.BUCKET.get(fileId, r2Range ? { range: r2Range } : undefined);

      if (!object) {
        console.error(`[SV][R2_NOT_FOUND] Key: ${fileId?.slice(0, 8)}...`);
        await recordPlaybackEvent(env, {
          type: 'video_not_found',
          ...commonMeta,
          metadata: { errorCode: 'R2_NOT_FOUND' }
        }, { dedupe: true });
        return new Response("Video not found", { status: 404, headers: corsHeaders });
      }

      const responseHeaders = new Headers(corsHeaders);
      responseHeaders.set("Content-Type", "video/webm");
      responseHeaders.set("Accept-Ranges", "bytes");

      const servedRange = (object as any).range as { offset: number; length: number } | undefined;
      const isPartial = !!(r2Range && servedRange);

      if (isPartial && servedRange) {
        const end = servedRange.offset + servedRange.length - 1;
        responseHeaders.set("Content-Range", `bytes ${servedRange.offset}-${end}/${object.size}`);
        responseHeaders.set("Content-Length", String(servedRange.length));
      } else {
        responseHeaders.set("Content-Length", String(object.size));
      }

      console.log(`[SV][R2_RES] Status: ${isPartial ? 206 : 200}, Size: ${object.size}`);

      return new Response(object.body, {
        status: isPartial ? 206 : 200,
        headers: responseHeaders
      });
    } catch (err: any) {
      console.error("[SV][STREAM_ERROR]", err);

      await recordPlaybackEvent(env, {
        type: 'playback_failed',
        ...commonMeta,
        metadata: {
          errorCode: 'R2_FETCH_FAILED',
          errorMessage: err.message
        }
      });

      return new Response("Streaming failed", {
        status: 500,
        headers: corsHeaders
      });
    }
  }
};

// Parses an HTTP Range header ("bytes=0-499", "bytes=500-", "bytes=-500")
// into the shape R2Bucket.get()'s `range` option expects.
function parseRangeHeader(rangeHeader: string | null): { offset?: number; length?: number; suffix?: number } | undefined {
  if (!rangeHeader) return undefined;
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return undefined;

  const [, startStr, endStr] = match;
  if (startStr === '' && endStr !== '') {
    return { suffix: parseInt(endStr, 10) };
  }
  if (startStr === '') return undefined;

  const offset = parseInt(startStr, 10);
  if (endStr === '') return { offset };

  const end = parseInt(endStr, 10);
  return { offset, length: Math.max(1, end - offset + 1) };
}

async function recordPlaybackEvent(env: any, data: {
  type: string;
  userId?: string;
  workspaceId?: string;
  videoId?: string;
  sessionId?: string | null;
  metadata?: any;
}, options: { dedupe?: boolean } = {}) {
  try {
    // Safety check for DB binding and required fields
    if (!env.DB) {
      console.error('DB binding missing in proxy worker');
      return;
    }

    if (!data || !data.type) {
      console.warn('Attempted to record event without type');
      return;
    }

    if (options.dedupe && data.sessionId) {
      const errorCode = data.metadata?.errorCode;
      let query = 'SELECT id FROM metrics_events WHERE sessionId = ? AND type = ?';
      const params: any[] = [data.sessionId, data.type];

      if (errorCode) {
        query += " AND JSON_EXTRACT(metadata, '$.errorCode') = ?";
        params.push(errorCode);
      }

      const existing = await env.DB.prepare(query).bind(...params).first();
      if (existing) return;
    }

    if (data.type === 'browser_video_error') {
      await env.DB.prepare(
        'INSERT INTO debug_logs (id, tag, data, source, timestamp, sessionId) VALUES (?, ?, ?, ?, ?, ?)'
      )
        .bind(
          crypto.randomUUID(),
          'BROWSER_VIDEO_ERROR',
          JSON.stringify(data.metadata || {}),
          'Extension',
          Date.now(),
          data.sessionId || null
        )
        .run();
      return;
    }

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

    await env.DB.prepare(
      'INSERT INTO metrics_events (id, type, userId, workspaceId, videoId, metadata, createdAt, sessionId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(...bindValues)
      .run();
  } catch (e: any) {
    console.error('Failed to record playback event:', e.message, JSON.stringify(data));
  }
}

async function decryptFileId(encryptedBase64: string, encryptionKey: string): Promise<string> {
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY not configured');
  }

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

  // Import Key
  const enc = new TextEncoder();
  const keyData = enc.encode(encryptionKey.padEnd(32, '0').slice(0, 32));
  const key = await crypto.subtle.importKey('raw', keyData, 'AES-GCM', false, ['decrypt']);

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
}
