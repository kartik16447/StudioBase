import { z } from 'zod';

export const GoogleAuthSchema = z.union([
  z.object({ accessToken: z.string().min(1) }),
  z.object({ code: z.string().min(1), codeVerifier: z.string().min(1), redirectUri: z.string().min(1) }),
]);
