import { BACKEND_URL } from "../../../shared/constants";
import { BackendUser } from "../types";
import { getScreenshots, Session } from "./session-manager";

/**
 * Uploads a completed session and its associated screenshots to R2.
 * Returns the backend-assigned sessionId.
 */
export async function uploadSession(
  session: Session,
  onProgress?: (pct: number) => void
): Promise<string> {
  // 1. Fetch the authenticated user and workspace
  const { sv_user, workspaceId } = (await chrome.storage.local.get(["sv_user", "workspaceId"])) as {
    sv_user: BackendUser;
    workspaceId: string;
  };

  if (!sv_user || !sv_user.accessToken) {
    throw new Error("Authentication required: Please sign in via the extension popup.");
  }

  const token = sv_user.accessToken;

  // 2. Initialize the session on the backend
  const initRes = await fetch(`${BACKEND_URL}/sessions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sessionId: session.sessionId,
      workspaceId: workspaceId || sv_user.workspaceId,
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
  const activeSessionId = backendSessionId || session.sessionId;
  
  if (onProgress) onProgress(10);

  // 3. Upload each screenshot captured during the session
  const screenshots = await getScreenshots(session.sessionId);
  const screenshotMetadata: { stepIndex: number; r2Key: string }[] = [];

  for (const { stepIndex, blob } of screenshots) {
    const key = `screenshots/${activeSessionId}/${stepIndex}.jpg`;
    
    // Request a presigned URL for the screenshot
    const presignRes = await fetch(`${BACKEND_URL}/upload/presign`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: activeSessionId,
        files: [{ key, contentType: "image/jpeg" }]
      })
    });

    if (!presignRes.ok) {
      const errorBody = await presignRes.text();
      throw new Error(`[StudioBase] Screenshot presign failed: ${presignRes.status} ${errorBody}`);
    }

    const presignData = await presignRes.json();
    const uploadUrl = presignData.files?.[0]?.uploadUrl;
    if (!uploadUrl) {
      throw new Error(`[StudioBase] Presign response missing uploadUrl for screenshot ${stepIndex}`);
    }

    // Upload the blob directly to R2
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "image/jpeg",
      },
      body: blob,
    });

    if (!putRes.ok) {
      const errorBody = await putRes.text();
      throw new Error(`[StudioBase] Screenshot R2 upload failed: ${putRes.status} ${errorBody}`);
    }

    screenshotMetadata.push({ stepIndex, r2Key: key });
  }
  
  if (onProgress) onProgress(50);

  // 4. Assemble the final session envelope
  const finalEnvelope = {
    ...session,
    screenshots: screenshotMetadata,
  };

  // 5. Upload the final session JSON
  const jsonKey = `sessions/${activeSessionId}/session.json`;
  const jsonPresignRes = await fetch(`${BACKEND_URL}/upload/presign`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sessionId: activeSessionId,
      files: [{ key: jsonKey, contentType: "application/json" }]
    })
  });

  if (!jsonPresignRes.ok) {
    const errorBody = await jsonPresignRes.text();
    throw new Error(`[StudioBase] Session JSON presign failed: ${jsonPresignRes.status} ${errorBody}`);
  }

  const jsonPresignData = await jsonPresignRes.json();
  const jsonUploadUrl = jsonPresignData.files?.[0]?.uploadUrl;
  if (!jsonUploadUrl) {
    throw new Error("[StudioBase] Presign response missing uploadUrl for session JSON");
  }

  const jsonPutRes = await fetch(jsonUploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(finalEnvelope),
  });

  if (!jsonPutRes.ok) {
    const errorBody = await jsonPutRes.text();
    throw new Error(`[StudioBase] Session JSON R2 upload failed: ${jsonPutRes.status} ${errorBody}`);
  }
  
  if (onProgress) onProgress(90);

  // 6. Finalize the session on the backend
  const stepCount = session.events?.length || 0;
  const durationMs = session.endedAt && session.startedAt 
    ? new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()
    : 0;

  const finalizeRes = await fetch(`${BACKEND_URL}/sessions/${activeSessionId}`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: "uploaded",
      r2JsonKey: jsonKey,
      stepCount,
      durationMs
    }),
  });

  if (!finalizeRes.ok) {
    const errorText = await finalizeRes.text();
    throw new Error(`[StudioBase] Session finalization failed: ${finalizeRes.status} ${errorText}`);
  }

  // 7. Trigger the pipeline
  const triggerRes = await fetch(`${BACKEND_URL}/pipeline/trigger`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ 
      sessionId: activeSessionId,
      requestedOutputs: { sop: true, demo: true }
    }),
  });

  if (!triggerRes.ok) {
    const errorBody = await triggerRes.text();
    console.warn(`[StudioBase] Pipeline trigger failed: ${triggerRes.status} ${errorBody}`);
  }

  if (onProgress) onProgress(100);

  console.log(`[StudioBase] Session ${activeSessionId} successfully fully uploaded and pipeline triggered.`);
  return activeSessionId;
}
