import { z } from 'zod';

// Matches the internal content of a step
export const StepContentSchema = z.object({
  actionType: z.string().optional(),
  targetElement: z.string().optional(),
  interactionCoordinates: z.object({
    x: z.number(),
    y: z.number()
  }).optional(),
  textInput: z.string().optional(),
  cameraConfig: z.object({
    zoom: z.number().optional(),
    x: z.number().optional(),
    y: z.number().optional()
  }).optional(),
}).passthrough();

// Matches the D1 row representation
export const StepRowSchema = z.object({
  id: z.string().uuid(),
  sopId: z.string(),
  workspaceId: z.string(),
  stepIndex: z.number().int(),
  type: z.string(),
  content: StepContentSchema,
  version: z.number().int().default(1),
  createdAt: z.number(),
  updatedAt: z.number()
});

// Canonical Envelope for full R2 state
export const SessionEnvelopeSchema = z.object({
  schemaVersion: z.literal("1.0"),
  metadata: z.record(z.string(), z.any()).optional(),
  rawEvents: z.array(z.any()),
  steps: z.array(z.any()).optional() // Leaving relaxed for now, or use StepContentSchema
});
