const KEY = 'sv_user';

export interface WebUser {
  accessToken: string;
  userId: string;
  email: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceRole: string;
}

export function getUser(): WebUser | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setUser(user: WebUser) {
  localStorage.setItem(KEY, JSON.stringify(user));
}

export function clearUser() {
  localStorage.removeItem(KEY);
}

const SIGNED_OUT = 'sv_signed_out';

// Explicit sign-out: don't sign straight back in from the extension in this tab session.
export function signOut() {
  clearUser();
  try { sessionStorage.setItem(SIGNED_OUT, '1'); } catch {}
}

// Store copy first, then the fixed-ID test build.
const EXTENSION_IDS = ['ejaghjlljgimabjjfmkcopcaphaedldg', 'apfanhgidpiibhefkaienhpcfpigalbd'];

function askExtension(id: string): Promise<WebUser | null> {
  return new Promise((resolve) => {
    const runtime = (window as any).chrome?.runtime;
    if (!runtime?.sendMessage) return resolve(null);
    const timer = setTimeout(() => resolve(null), 1500);
    try {
      runtime.sendMessage(id, { type: 'GET_WEB_SESSION' }, (res: any) => {
        clearTimeout(timer);
        void runtime.lastError; // not installed: read it so Chrome doesn't log it
        resolve(res && res.accessToken && res.workspaceId ? (res as WebUser) : null);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

// Signed in to the extension? Then the dashboard is signed in too.
export async function signInFromExtension(): Promise<WebUser | null> {
  try { if (sessionStorage.getItem(SIGNED_OUT)) return null; } catch {}
  for (const id of EXTENSION_IDS) {
    const user = await askExtension(id);
    if (user) {
      setUser(user);
      return user;
    }
  }
  return null;
}

export function clearSignedOutFlag() {
  try { sessionStorage.removeItem(SIGNED_OUT); } catch {}
}
