import { BackendUser } from "../types";
import { BACKEND_URL } from "../../../shared/constants";

const API_BASE = BACKEND_URL || "https://studiobase-backend.karthik-upadhyay98.workers.dev";

/**
 * Uploads a completed session JSON blob to R2 via the backend presign endpoint.
 */
export async function uploadSession(sessionId: string, payload: object): Promise<void> {
  try {
    // 1. Fetch the authenticated user from storage
    const { sb_user } = (await chrome.storage.local.get("sb_user")) as {
      sb_user: BackendUser;
    };

    if (!sb_user || !sb_user.accessToken) {
      throw new Error("No authenticated user found. Please sign in to upload.");
    }

    // 2. Get the presigned URL from the backend
    const presignRes = await fetch(`${API_BASE}/sessions/${sessionId}/presign`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${sb_user.accessToken}`,
      },
    });

    if (!presignRes.ok) {
      const errorText = await presignRes.text();
      throw new Error(`Failed to get presigned URL: ${presignRes.status} ${errorText}`);
    }

    const { uploadUrl } = await presignRes.json();
    if (!uploadUrl) {
      throw new Error("Presign response missing uploadUrl");
    }

    // 3. PUT the payload to R2
    const uploadRes = await fetch(uploadUrl, {
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

    console.log(`[StudioBase] Session ${sessionId} uploaded successfully to R2.`);
  } catch (err: any) {
    console.error(`[StudioBase] Upload error for session ${sessionId}:`, err);
    throw new Error(`Upload failed: ${err.message}`);
  }
}
