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

    console.log(`[SV][FETCH_START] Decrypted: ${isDecrypted}, ID: ${fileId?.slice(0, 8)}..., Session: ${sessionId || 'none'}`);

    // Resolve videoId and workspaceId for linkage, and get current fileId.
    // fileId in the DB may differ from the decrypted URL param when progressive upload
    // replaced the placeholder with the real uploaded file.
    const video = (await env.DB.prepare('SELECT id, title, workspaceId, ownerId, actualDurationMs, fileId FROM videos WHERE fileId = ? OR encryptedFileId = ?')
      .bind(fileId, rawEncryptedId)
      .first()) as any;

    // Always stream from the DB's current fileId (may have been updated after POST upload)
    if (video?.fileId && isDecrypted) {
      fileId = video.fileId;
    }

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
          "X-SV-Version": "2.1-bypass-hardened"
        }
      });
    }

    // Handle GET (stream)
    try {
      const rangeHeader = request.headers.get("Range");
      
      // ONLY log playback_started for the initial request (not for every byte-range request)
      if (!rangeHeader || rangeHeader === 'bytes=0-') {
        await recordPlaybackEvent(env, {
          type: 'playback_started',
          ...commonMeta
        }, { dedupe: true });
      }

      const fetchOptions: any = {
        method: "GET",
        headers: rangeHeader ? { "Range": rangeHeader } : {},
      };

      // Public capability-based streaming via standard UC link with export=download for better reliability
      const driveUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      
      console.log(`[SV][DRIVE_FETCH] ID: ${fileId?.slice(0, 8)}..., Range: ${rangeHeader || 'none'}`);

      // 1. Initial check (without Range header) to handle potential Virus Scan Warning
      let driveRes = await fetch(driveUrl);
      const contentType = driveRes.headers.get("Content-Type") || "";

      // Create a clean response with required streaming headers
      const responseHeaders = new Headers(corsHeaders);
      responseHeaders.set("Content-Type", "video/webm");
      responseHeaders.set("Accept-Ranges", "bytes");

      if (driveRes.ok && contentType.includes("text/html")) {
          const driveResClone = driveRes.clone();
          const html = await driveRes.text();
          
          const confirmMatch = html.match(/confirm=([a-zA-Z0-9_]+)/) || 
                               html.match(/name=['"]confirm['"]\s+value=['"]([a-zA-Z0-9_]+)['"]/) ||
                               html.match(/value=['"]([a-zA-Z0-9_]+)['"]\s+name=['"]confirm['"]/);
          
          const uuidMatch = html.match(/name=['"]uuid['"]\s+value=['"]([a-z0-9-]+)['"]/) ||
                            html.match(/value=['"]([a-z0-9-]+)['"]\s+name=['"]uuid['"]/);

          if (confirmMatch) {
              const confirmToken = confirmMatch[1];
              const uuidToken = uuidMatch ? uuidMatch[1] : null;
              
              if (!uuidToken && html.includes('uuid')) {
                 await recordPlaybackEvent(env, { type: 'DRIVE_UUID_PARSE_FAILED', ...commonMeta }, { dedupe: true });
              }

              console.log(`[SV][DRIVE_BYPASS_ATTEMPT] fileId: ${fileId}, confirmToken: ${confirmToken}, uuidToken: ${uuidToken}`);
              
              // Use usercontent domain for bypass - much more reliable for streaming
              let bypassUrl = `https://drive.usercontent.google.com/download?id=${fileId}&confirm=${confirmToken}&export=download`;
              if (uuidToken) bypassUrl += `&uuid=${uuidToken}`;

              // Final fetch WITH Range header
              driveRes = await fetch(bypassUrl, fetchOptions);
          } else {
              if (html.includes('uc-download') || html.includes('confirm')) {
                 await recordPlaybackEvent(env, { type: 'DRIVE_CONFIRM_PARSE_FAILED', ...commonMeta }, { dedupe: true });
                 return new Response(JSON.stringify({ error: "Google Drive bypass failed", code: "DRIVE_BYPASS_FAILED" }), {
                    status: 502,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                 });
              }
              driveRes = driveResClone;
          }
      } else if (rangeHeader && driveRes.status === 200) {
          // If first fetch was a full GET (200) but browser wants a Range (206), re-fetch
          // using usercontent domain which reliably supports byte-range requests
          driveRes.body?.cancel();
          const ucStreamUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
          driveRes = await fetch(ucStreamUrl, fetchOptions);
      }

      console.log(`[SV][DRIVE_RES] Status: ${driveRes.status}, Type: ${contentType}, Length: ${driveRes.headers.get("Content-Length")}`);

      if (!driveRes.ok && driveRes.status !== 206) {
        console.error(`[SV][DRIVE_FETCH_FAILED] Status: ${driveRes.status}, Range: ${rangeHeader}`);
        
        let eventType = 'playback_failed';
        let errorCode = 'PROXY_FETCH_FAILED';

        if (driveRes.status === 403) {
            eventType = 'drive_permission_denied';
            errorCode = 'DRIVE_403_PERMISSION';
        } else if (driveRes.status === 404) {
            eventType = 'video_not_found';
            errorCode = 'DRIVE_404_NOT_FOUND';
        } else if (driveRes.status === 416) {
            errorCode = 'DRIVE_416_RANGE_NOT_SATISFIABLE';
        }

        await recordPlaybackEvent(env, {
          type: eventType,
          ...commonMeta,
          metadata: { errorCode, status: driveRes.status, range: rangeHeader }
        }, { dedupe: true });

        return new Response(`Upstream failure: ${driveRes.status}`, { 
          status: driveRes.status, 
          headers: corsHeaders 
        });
      }

      // Pass through critical streaming headers from upstream
      const headersToPass = ["Content-Range", "Content-Length", "Accept-Ranges"];
      headersToPass.forEach(h => {
        const val = driveRes.headers.get(h);
        if (val) responseHeaders.set(h, val);
      });

      return new Response(driveRes.body, {
        status: driveRes.status,
        headers: responseHeaders
      });
    } catch (err: any) {
      console.error("[SV][STREAM_ERROR]", err);
      
      await recordPlaybackEvent(env, {
        type: 'playback_failed',
        ...commonMeta,
        metadata: { 
          errorCode: 'PROXY_FETCH_FAILED', 
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

