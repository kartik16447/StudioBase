import { BackendUser } from "../types";
import { BACKEND_URL } from "../../../shared/constants";

// TODO: this module is not imported anywhere in the active recording flow.
// The active upload path uses background/r2-uploader.ts. Kept for future use.
const API_BASE = BACKEND_URL;

/**
 * Uploads a completed session JSON blob to R2 via the backend presign endpoint.
 */
export async function uploadSession(sessionId: string, payload: object): Promise<void> {
  try {
    // 1. Fetch the authenticated token from storage
    const { sb_user } = (await chrome.storage.local.get("sb_user")) as { sb_user?: BackendUser };
    const token = sb_user?.accessToken;

    if (!token) {
      throw new Error("No authenticated user found. Please sign in to upload.");
    }

    // 2. Get the presigned URL from the backend
    const presignRes = await fetch(`${API_BASE}/upload/presign`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId,
        files: [
          { key: `sessions/${sessionId}/session.json`, contentType: "application/json" }
        ]
      })
    });

    if (!presignRes.ok) {
      const errorText = await presignRes.text();
      throw new Error(`Failed to get presigned URL: ${presignRes.status} ${errorText}`);
    }

    const presignData = await presignRes.json();
    const uploadTarget = presignData.files?.[0];
    if (!uploadTarget?.uploadUrl) {
      throw new Error("Presign response missing uploadUrl for session JSON");
    }

    // 3. PUT the payload to R2 (NO Authorization header here)
    const uploadRes = await fetch(uploadTarget.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!uploadRes.ok) {
      const errorText = await uploadRes.text();
      throw new Error(`R2 upload failed: ${uploadRes.status} ${errorText}`);
    }

    // 4. Call PATCH /sessions/:id to mark as uploaded
    const sessionData = payload as any;
    const stepCount = sessionData.events?.length || 0;
    const durationMs = sessionData.endedAt && sessionData.startedAt 
      ? new Date(sessionData.endedAt).getTime() - new Date(sessionData.startedAt).getTime()
      : 0;

    const patchRes = await fetch(`${API_BASE}/sessions/${sessionId}`, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "uploaded",
        r2JsonKey: `sessions/${sessionId}/session.json`,
        stepCount,
        durationMs
      }),
    });

    if (!patchRes.ok) {
      throw new Error(`Failed to patch session status: ${patchRes.status}`);
    }

    // 5. Trigger the pipeline
    const triggerRes = await fetch(`${API_BASE}/pipeline/trigger`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        sessionId,
        requestedOutputs: { sop: true, demo: true }
      }),
    });

    if (!triggerRes.ok) {
      console.warn("Pipeline trigger failed, session is still uploaded.");
    }
  } catch (err: any) {
    console.error(`[StudioBase] Upload error for session ${sessionId}:`, err);
    throw new Error(`Upload failed: ${err.message}`);
  }
}
