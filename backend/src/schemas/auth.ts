import { z } from 'zod';

export const GoogleAuthSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required'),
});
