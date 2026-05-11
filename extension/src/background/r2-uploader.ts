import { BACKEND_URL } from "../../../shared/constants";
import { BackendUser } from "../types";
import { getScreenshots, Session } from "./session-manager";

/**
 * Uploads a completed session and its associated screenshots to R2.
 */
export async function uploadSession(session: Session): Promise<void> {
  // 1. Fetch the authenticated user
  const { sb_user } = (await chrome.storage.local.get("sb_user")) as {
    sb_user: BackendUser;
  };

  if (!sb_user || !sb_user.accessToken) {
    throw new Error("Authentication required: No sb_user or accessToken found in storage.");
  }

  const token = sb_user.accessToken;

  // 2. Initialize the session on the backend
  const initRes = await fetch(`${BACKEND_URL}/sessions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sessionId: session.sessionId,
      tabUrl: session.tabUrl,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      eventCount: session.events.length,
    }),
  });

  if (!initRes.ok) {
    const errorText = await initRes.text();
    throw new Error(`Failed to initialize session on backend: ${initRes.status} ${errorText}`);
  }

  const { sessionId: backendSessionId } = await initRes.json();
  const activeSessionId = backendSessionId || session.sessionId;

  // 3. Upload each screenshot captured during the session
  const screenshots = await getScreenshots(session.sessionId);
  const screenshotMetadata: { stepIndex: number; r2Key: string }[] = [];

  for (const { stepIndex, blob } of screenshots) {
    const key = `screenshots/${activeSessionId}/${stepIndex}.jpg`;
    
    // Request a presigned URL for the screenshot
    const presignRes = await fetch(`${BACKEND_URL}/sessions/${activeSessionId}/presign?key=${encodeURIComponent(key)}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    if (!presignRes.ok) {
      throw new Error(`Failed to get presigned URL for screenshot ${stepIndex}: ${presignRes.status}`);
    }

    const { uploadUrl } = await presignRes.json();

    // Upload the blob directly to R2
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "image/jpeg",
      },
      body: blob,
    });

    if (!putRes.ok) {
      throw new Error(`Failed to upload screenshot ${stepIndex} to R2: ${putRes.status}`);
    }

    screenshotMetadata.push({ stepIndex, r2Key: key });
  }

  // 4. Assemble the final session envelope
  const finalEnvelope = {
    ...session,
    screenshots: screenshotMetadata,
  };

  // 5. Upload the final session JSON
  const jsonKey = `sessions/${activeSessionId}/session.json`;
  const jsonPresignRes = await fetch(`${BACKEND_URL}/sessions/${activeSessionId}/presign?key=${encodeURIComponent(jsonKey)}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
    },
  });

  if (!jsonPresignRes.ok) {
    throw new Error(`Failed to get presigned URL for session JSON: ${jsonPresignRes.status}`);
  }

  const { uploadUrl: jsonUploadUrl } = await jsonPresignRes.json();

  const jsonPutRes = await fetch(jsonUploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(finalEnvelope),
  });

  if (!jsonPutRes.ok) {
    throw new Error(`Failed to upload session JSON to R2: ${jsonPutRes.status}`);
  }

  // 6. Finalize the session on the backend
  const finalizeRes = await fetch(`${BACKEND_URL}/sessions/${activeSessionId}`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      r2JsonKey: jsonKey,
      status: "uploaded",
    }),
  });

  if (!finalizeRes.ok) {
    const errorText = await finalizeRes.text();
    throw new Error(`Failed to finalize session on backend: ${finalizeRes.status} ${errorText}`);
  }

  console.log(`[StudioBase] Session ${activeSessionId} successfully fully uploaded and finalized.`);
}
