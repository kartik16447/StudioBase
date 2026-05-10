import { BackendUser, StorageAccount } from "../types";

/**
 * Global lock to prevent concurrent token rotations.
 * Multiple simultaneous 401s will wait for the same rotation process.
 */
let refreshPromise: Promise<string | null> | null = null;

/**
 * Lightweight check to see if a token is still valid on our backend.
 */
async function probeToken(token: string): Promise<boolean> {
  try {
    const res = await fetch("https://screenvault-backend.karthik-upadhyay98.workers.dev/videos?limit=0", {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.status !== 401;
  } catch (e) {
    return false;
  }
}

/**
 * Attempts to find a working token among all linked accounts.
 * Returns the working token or null if none are valid.
 */
async function rotateToken(failedToken?: string): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const now = new Date().toISOString();
    console.group(`[Auth Rotation ${now}]`);
    console.log(`[Auth ${now}] Token expired, starting rotation`);

    try {
      const { sv_user, sv_accounts, lastUsedEmail } = (await chrome.storage.local.get([
        "sv_user",
        "sv_accounts",
        "lastUsedEmail"
      ])) as { sv_user?: BackendUser; sv_accounts?: StorageAccount[]; lastUsedEmail?: string };

      if (!sv_user) {
        console.groupEnd();
        return null;
      }

      // 1. Build priority list of accounts to try
      const accounts = sv_accounts || [];
      const priorityList: StorageAccount[] = [];

      // Priority 1: Match lastUsedEmail (smart rotation)
      const lastUsed = accounts.find(a => a.email === lastUsedEmail);
      if (lastUsed) priorityList.push(lastUsed);

      // Priority 2: All other accounts
      accounts.forEach(a => {
        if (a.email !== lastUsedEmail) priorityList.push(a);
      });

      // 2. Probe each account
      for (const account of priorityList) {
        // [Optimization] Skip the token that just failed or the current identity token if they match
        if (account.accessToken === failedToken || account.accessToken === sv_user.accessToken) {
          continue;
        }

        console.log(`[Auth ${now}] Trying token for:`, account.email);
        const isValid = await probeToken(account.accessToken);

        if (isValid) {
          console.log(`[Auth ${now}] Token rotation success:`, account.email);
          
          const updatedUser: BackendUser = { ...sv_user, accessToken: account.accessToken };
          await chrome.storage.local.set({ sv_user: updatedUser });
          
          console.groupEnd();
          return account.accessToken;
        } else {
          console.warn(`[Auth ${now}] Token failed:`, account.email);
        }
      }

      console.error(`[Auth ${now}] All tokens invalid, clearing session`);
      console.groupEnd();
      return null;
    } catch (err) {
      console.error(`[Auth ${now}] Token rotation process failed:`, err);
      console.groupEnd();
      return null;
    }
  })();

  const result = await refreshPromise;
  refreshPromise = null; // Reset lock after completion
  return result;
}

/**
 * A concurrent-safe wrapper around fetch that handles 401 Unauthorized 
 * by automatically rotating through other linked Google accounts.
 */
export async function safeFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { sv_user } = (await chrome.storage.local.get("sv_user")) as { sv_user?: BackendUser };

  if (!sv_user?.accessToken) {
    throw new Error("No session found. Please sign in.");
  }

  const sendRequest = (token: string) => {
    const headers = {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    };
    return fetch(url, { ...options, headers });
  };

  // 1. Initial Attempt
  let response = await sendRequest(sv_user.accessToken);

  // 2. If 401, handle Rotation with Global Lock (Retry Guard)
  if (response.status === 401) {
    // [Optimization] Pass the failed token to avoid redundant probing
    const newToken = await rotateToken(sv_user.accessToken);

    if (newToken) {
      // Retry ONCE with the new token - directly returning ensure only one retry occurs
      return await sendRequest(newToken);
    }

    // 3. If no tokens work, the session is truly dead
    await chrome.storage.local.remove("sv_user");
    throw new Error("Session expired. Please reconnect your account.");
  }

  return response;
}
