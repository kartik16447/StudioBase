import { BACKEND_URL } from "../../../shared/constants";
import { BackendUser } from "../types";
import { getScreenshots, Session } from "./session-manager";
import { sbLog } from "../logger";

/**
 * Uploads a completed session and its associated screenshots to R2.
 * Returns the backend-assigned sessionId.
 */
export async function uploadSession(
  session: Session,
  onProgress?: (pct: number) => void,
  videoBlob?: Blob | null,
): Promise<string> {
  // 1. Fetch the authenticated user and workspace
  const { sb_user, workspaceId } = (await chrome.storage.local.get([
    "sb_user",
    "workspaceId",
  ])) as {
    sb_user: BackendUser;
    workspaceId: string;
  };

  if (!sb_user || !sb_user.accessToken) {
    throw new Error(
      "Authentication required: Please sign in via the extension popup.",
    );
  }

  const token = sb_user.accessToken;

  // 2. Initialize the session on the backend
  const initRes = await fetch(`${BACKEND_URL}/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sessionId: session.sessionId,
      workspaceId: workspaceId || sb_user.workspaceId,
      tabUrl: session.tabUrl,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      eventCount: session.events.length,
    }),
  });

  if (!initRes.ok) {
    const errorBody = await initRes.text();
    throw new Error(
      `[StudioBase] Session initialization failed: ${initRes.status} ${errorBody}`,
    );
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
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: activeSessionId,
        files: [{ key, contentType: "image/jpeg" }],
      }),
    });

    if (!presignRes.ok) {
      const errorBody = await presignRes.text();
      throw new Error(
        `[StudioBase] Screenshot presign failed: ${presignRes.status} ${errorBody}`,
      );
    }

    const presignData = await presignRes.json();
    const uploadUrl = presignData.files?.[0]?.uploadUrl;
    if (!uploadUrl) {
      throw new Error(
        `[StudioBase] Presign response missing uploadUrl for screenshot ${stepIndex}`,
      );
    }

    // Upload the blob directly to R2 via worker proxy
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "image/jpeg",
        Authorization: `Bearer ${token}`,
      },
      body: blob,
    });

    if (!putRes.ok) {
      const errorBody = await putRes.text();
      throw new Error(
        `[StudioBase] Screenshot R2 upload failed: ${putRes.status} ${errorBody}`,
      );
    }

    screenshotMetadata.push({ stepIndex, r2Key: key });
  }

  if (onProgress) onProgress(50);

  let videoKey: string | null = null;
  if (videoBlob) {
    videoKey = `sessions/${activeSessionId}/screen-recording.webm`;
    const presignRes = await fetch(`${BACKEND_URL}/upload/presign`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: activeSessionId,
        files: [{ key: videoKey, contentType: 'video/webm' }]
      })
    });
    
    if (presignRes.ok) {
      const presignData = await presignRes.json();
      const uploadUrl = presignData.files?.[0]?.uploadUrl;
      if (uploadUrl) {
        await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'video/webm', Authorization: `Bearer ${token}` },
          body: videoBlob
        });
      }
    }
  }

  // 4. Assemble the final session envelope
  const finalEnvelope = {
    ...session,
    screenshots: screenshotMetadata,
    videoKey: videoKey || null,
  };

  // 5. Upload the final session JSON
  const jsonKey = `sessions/${activeSessionId}/session.json`;
  const jsonPresignRes = await fetch(`${BACKEND_URL}/upload/presign`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sessionId: activeSessionId,
      files: [{ key: jsonKey, contentType: "application/json" }],
    }),
  });

  if (!jsonPresignRes.ok) {
    const errorBody = await jsonPresignRes.text();
    throw new Error(
      `[StudioBase] Session JSON presign failed: ${jsonPresignRes.status} ${errorBody}`,
    );
  }

  const jsonPresignData = await jsonPresignRes.json();
  const jsonUploadUrl = jsonPresignData.files?.[0]?.uploadUrl;
  if (!jsonUploadUrl) {
    throw new Error(
      "[StudioBase] Presign response missing uploadUrl for session JSON",
    );
  }

  const jsonPutRes = await fetch(jsonUploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(finalEnvelope),
  });

  if (!jsonPutRes.ok) {
    const errorBody = await jsonPutRes.text();
    throw new Error(
      `[StudioBase] Session JSON R2 upload failed: ${jsonPutRes.status} ${errorBody}`,
    );
  }

  if (onProgress) onProgress(90);

  // 6. Finalize the session on the backend
  const stepCount = session.events?.length || 0;
  const durationMs =
    session.endedAt && session.startedAt
      ? new Date(session.endedAt).getTime() -
        new Date(session.startedAt).getTime()
      : 0;

  const finalizeRes = await fetch(
    `${BACKEND_URL}/sessions/${activeSessionId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "uploaded",
        r2JsonKey: jsonKey,
        r2VideoKey: videoKey || undefined,
        stepCount,
        durationMs,
      }),
    },
  );

  if (!finalizeRes.ok) {
    const errorText = await finalizeRes.text();
    throw new Error(
      `[StudioBase] Session finalization failed: ${finalizeRes.status} ${errorText}`,
    );
  }

  if (onProgress) onProgress(100);

  sbLog("UPLOAD_COMPLETE", { sessionId: activeSessionId });
  return activeSessionId;
}
