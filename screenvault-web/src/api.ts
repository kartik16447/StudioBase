import { getUser, clearUser } from './auth';

const AUTH_ERROR_MESSAGES = ['invalid access token', 'missing authorization', 'user not found'];

export async function safeFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const user = getUser();

  if (!user?.accessToken) {
    window.location.href = '/login';
    throw new Error('No session. Redirecting to login.');
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${user.accessToken}`,
    },
  });

  if (response.status === 401) {
    clearUser();
    window.location.href = '/login';
    throw new Error('Session expired. Please sign in again.');
  }

  // Backend returns 400 when Google token expires (not 401).
  // Detect auth errors by message and redirect to login.
  if (response.status === 400) {
    const cloned = response.clone();
    try {
      const json = await cloned.json();
      const msg = (json?.error || '').toLowerCase();
      if (AUTH_ERROR_MESSAGES.some(e => msg.includes(e))) {
        clearUser();
        window.location.href = '/login';
        throw new Error('Session expired. Please sign in again.');
      }
    } catch (e: any) {
      if (e.message === 'Session expired. Please sign in again.') throw e;
      // not JSON or not an auth error — fall through
    }
  }

  return response;
}
