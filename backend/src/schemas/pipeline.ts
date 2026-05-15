import { z } from 'zod';

export const TriggerPipelineSchema = z.object({
  sessionId: z.string().uuid(),
  requestedOutputs: z.object({
    sop: z.boolean().optional(),
    demo: z.boolean().optional(),
    video: z.boolean().optional(),
  }).refine((data) => data.sop || data.demo || data.video, {
    message: 'Select at least one output',
  }),
});

export const TopupCreditsSchema = z.object({
  amount: z.number().int().positive('Amount must be positive'),
  stripeSessionId: z.string().optional(), // Future proofing
});
