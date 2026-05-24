import { getUser, clearUser } from './auth';

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

  return response;
}
