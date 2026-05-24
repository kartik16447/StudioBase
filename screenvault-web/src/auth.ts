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
