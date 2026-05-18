import { BACKEND_URL } from "../../../shared/constants";
import { BackendUser } from "../types";
import { getScreenshots, getChunks, Session } from "./session-manager";
import { sbLog } from "../logger";

interface AuthContext {
  token: string;
  resolvedWorkspaceId: string;
}

async function getAuthContext(): Promise<AuthContext> {
  const { sb_user, workspaceId } = (await chrome.storage.local.get([
    "sb_user",
    "workspaceId",
  ])) as { sb_user: BackendUser; workspaceId: string };

  if (!sb_user?.accessToken) {
    throw new Error("Authentication required: Please sign in via the extension popup.");
  }

  return {
    token: sb_user.accessToken,
    resolvedWorkspaceId: workspaceId || sb_user.workspaceId,
  };
}

/**
 * Step 1: Creates the session on the backend and returns the session ID immediately.
 * Call this first so the link can be shown to the user without waiting for uploads.
 */
export async function initSession(session: Session): Promise<{ activeSessionId: string } & AuthContext> {
  const auth = await getAuthContext();

  const initRes = await fetch(`${BACKEND_URL}/v1/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "x-workspace-id": auth.resolvedWorkspaceId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sessionId: session.sessionId,
      workspaceId: auth.resolvedWorkspaceId,
      tabUrl: session.tabUrl,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      eventCount: session.events.length,
    }),
  });

  if (!initRes.ok) {
    const errorBody = await initRes.text();
    throw new Error(`[StudioBase] Session initialization failed: ${initRes.status} ${errorBody}`);
  }

  const { id: backendSessionId } = await initRes.json();
  return { activeSessionId: backendSessionId || session.sessionId, ...auth };
}

/**
 * Step 2: Upload all assets in the background.
 * Screenshots are batch-presigned and uploaded in parallel.
 * Video uses multipart upload. Finalizes the session when done.
 */
export async function uploadSessionAssets(
  session: Session,
  activeSessionId: string,
  auth: AuthContext,
  onProgress?: (pct: number) => void,
  includeVideo?: boolean,
): Promise<void> {
  const { token, resolvedWorkspaceId } = auth;

  // ── Screenshots: batch presign + parallel upload ──────────────
  const screenshots = await getScreenshots(session.sessionId);
  const screenshotMetadata: { stepIndex: number; r2Key: string }[] = [];

  if (screenshots.length > 0) {
    const files = screenshots.map(({ stepIndex }) => ({
      key: `screenshots/${activeSessionId}/${stepIndex}.jpg`,
      contentType: "image/jpeg",
    }));

    // One round trip to presign all screenshots at once
    const presignRes = await fetch(`${BACKEND_URL}/v1/assets/upload/presign`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-workspace-id": resolvedWorkspaceId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId: activeSessionId, files }),
    });

    if (!presignRes.ok) {
      throw new Error(`[StudioBase] Batch screenshot presign failed: ${presignRes.status}`);
    }

    const { files: presignedFiles } = await presignRes.json();

    // Upload all screenshots in parallel
    await Promise.all(
      screenshots.map(async ({ stepIndex, blob }, i) => {
        const uploadUrl = presignedFiles[i]?.uploadUrl;
        if (!uploadUrl) throw new Error(`[StudioBase] Missing uploadUrl for screenshot ${stepIndex}`);

        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "image/jpeg",
            Authorization: `Bearer ${token}`,
            "x-workspace-id": resolvedWorkspaceId,
          },
          body: blob,
        });

        if (!putRes.ok) {
          throw new Error(`[StudioBase] Screenshot upload failed: ${putRes.status}`);
        }

        screenshotMetadata.push({ stepIndex, r2Key: files[i].key });
      })
    );
  }

  if (onProgress) onProgress(50);

  // ── Video: multipart upload ───────────────────────────────────
  let videoKey: string | null = null;
  if (includeVideo) {
    try {
      videoKey = `videos/${activeSessionId}/screen-recording.webm`;
      console.log("📤 [Uploader] Starting multipart video upload for:", videoKey);

      const initRes = await fetch(`${BACKEND_URL}/v1/assets/upload/multipart/init`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "x-workspace-id": resolvedWorkspaceId, "Content-Type": "application/json" },
        body: JSON.stringify({ key: videoKey }),
      });
      if (!initRes.ok) throw new Error("Multipart init failed");
      const { uploadId } = await initRes.json() as any;

      const dbChunks = await getChunks(session.sessionId);
      if (dbChunks.length === 0) {
        console.warn("📤 [Uploader] No video chunks found in IndexedDB.");
        videoKey = null;
      } else {
        const fullVideoBlob = new Blob(dbChunks.map(c => c.blob), { type: "video/webm" });
        const PART_SIZE = 5 * 1024 * 1024;
        const slicedParts: Blob[] = [];
        for (let i = 0; i < fullVideoBlob.size; i += PART_SIZE) {
          slicedParts.push(fullVideoBlob.slice(i, i + PART_SIZE));
        }

        const parts: { partNumber: number; etag: string }[] = [];

        for (let i = 0; i < slicedParts.length; i++) {
          const partNumber = i + 1;
          if (onProgress) onProgress(50 + Math.floor((i / slicedParts.length) * 35));

          const partRes = await fetch(`${BACKEND_URL}/v1/assets/upload/multipart/presign-part`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "x-workspace-id": resolvedWorkspaceId, "Content-Type": "application/json" },
            body: JSON.stringify({ key: videoKey, uploadId, partNumber }),
          });
          if (!partRes.ok) throw new Error(`Presign failed for part ${partNumber}`);
          const { uploadUrl } = await partRes.json() as any;

          const putRes = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": "video/webm", Authorization: `Bearer ${token}`, "x-workspace-id": resolvedWorkspaceId },
            body: slicedParts[i],
          });
          if (!putRes.ok) throw new Error(`Upload failed for part ${partNumber}`);

          const responseData = await putRes.json() as any;
          console.log(`🔍 [Uploader] Part ${partNumber} Worker Response:`, responseData);

          let etag = responseData.etag;
          if (!etag) throw new Error("FATAL: ETag is missing from the Worker's JSON response.");
          etag = etag.replace(/"/g, "");
          parts.push({ partNumber, etag });
        }

        const completeRes = await fetch(`${BACKEND_URL}/v1/assets/upload/multipart/complete`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "x-workspace-id": resolvedWorkspaceId, "Content-Type": "application/json" },
          body: JSON.stringify({ key: videoKey, uploadId, parts }),
        });
        if (!completeRes.ok) throw new Error("Multipart completion failed");
        console.log("📤 [Uploader] Multipart upload finalized successfully.");
      }
    } catch (err) {
      console.error("📤 [Uploader] Multipart video upload failed:", err);
      videoKey = null;
    }
  }

  // ── Session JSON ──────────────────────────────────────────────
  const { events: rawEvents, ...sessionWithoutEvents } = session;
  const finalEnvelope = {
    ...((!session.steps || session.steps.length === 0) ? { events: rawEvents } : {}),
    ...sessionWithoutEvents,
    screenshots: screenshotMetadata,
    videoKey: videoKey || null,
  };

  const jsonKey = `sessions/${activeSessionId}/session.json`;
  const jsonPresignRes = await fetch(`${BACKEND_URL}/v1/assets/upload/presign`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "x-workspace-id": resolvedWorkspaceId, "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: activeSessionId, files: [{ key: jsonKey, contentType: "application/json" }] }),
  });

  if (!jsonPresignRes.ok) {
    throw new Error(`[StudioBase] Session JSON presign failed: ${jsonPresignRes.status}`);
  }

  const { files: jsonFiles } = await jsonPresignRes.json();
  const jsonUploadUrl = jsonFiles?.[0]?.uploadUrl;
  if (!jsonUploadUrl) throw new Error("[StudioBase] Missing uploadUrl for session JSON");

  const jsonPutRes = await fetch(jsonUploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "x-workspace-id": resolvedWorkspaceId },
    body: JSON.stringify(finalEnvelope),
  });

  if (!jsonPutRes.ok) {
    throw new Error(`[StudioBase] Session JSON upload failed: ${jsonPutRes.status}`);
  }

  if (onProgress) onProgress(90);

  // ── Finalize ──────────────────────────────────────────────────
  const stepCount = session.events?.length || 0;
  const durationMs = session.endedAt && session.startedAt
    ? new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()
    : 0;

  const finalizeRes = await fetch(`${BACKEND_URL}/v1/sessions/${activeSessionId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "x-workspace-id": resolvedWorkspaceId, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "queued", r2JsonKey: jsonKey, r2VideoKey: videoKey || undefined, stepCount, durationMs }),
  });

  if (!finalizeRes.ok) {
    throw new Error(`[StudioBase] Session finalization failed: ${finalizeRes.status}`);
  }

  // Trigger pipeline (fire and forget)
  fetch(`${BACKEND_URL}/v1/pipeline/trigger`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "x-workspace-id": resolvedWorkspaceId, "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: activeSessionId }),
  }).catch(err => console.warn("[StudioBase] Pipeline trigger failed:", err));

  if (onProgress) onProgress(100);
  sbLog("UPLOAD_COMPLETE", { sessionId: activeSessionId });
}

/**
 * Convenience wrapper used by retryUpload — runs init + upload sequentially.
 */
export async function uploadSession(
  session: Session,
  onProgress?: (pct: number) => void,
  includeVideo?: boolean,
): Promise<string> {
  const { activeSessionId, ...auth } = await initSession(session);
  await uploadSessionAssets(session, activeSessionId, auth, onProgress, includeVideo);
  return activeSessionId;
}
