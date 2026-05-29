import { z } from 'zod';

export const DemoCardSchema = z.object({
  id: z.string(),
  type: z.enum(['text', 'cta', 'blur', 'callout', 'video', 'form', 'image', 'embed']),
  order: z.number(),
  title: z.string().optional(),
  body: z.string().optional(),
  rect: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
  color: z.string().optional(),
  label: z.string().optional(),
  ctaLabel: z.string().optional(),
  ctaUrl: z.string().optional(),
  imageKey: z.string().optional(),
  videoUrl: z.string().optional(),
  formFields: z.array(z.object({
    id: z.string(),
    label: z.string(),
    type: z.enum(['text', 'email']),
  })).optional(),
});

export const AnnotationSchema = z.object({
  id: z.string(),
  shape: z.enum(['arrow', 'box', 'circle', 'text', 'blur']),
  x: z.number(),       // percent of screenshot width
  y: z.number(),       // percent of screenshot height
  width: z.number().optional(),
  height: z.number().optional(),
  color: z.string().optional(),
  text: z.string().optional(),
});

export const AnimationTargetSchema = z.object({
  // Pipeline v2 format: 0–100 percent of image dimensions
  pctX: z.number().optional(),
  pctY: z.number().optional(),
  // Legacy format: 0–1 normalised (kept for backwards compatibility)
  centerX: z.number().optional(),
  centerY: z.number().optional(),
  zoomScale: z.number(),
  transitionType: z.enum(['slide', 'fade', 'zoom', 'instant']).optional(),
  transitionDurationMs: z.number().optional(),
});

export const StepSchema = z.object({
  id: z.string(),
  sequence: z.number().int().positive(),
  action: z.string(), // can be ActionType string
  timestamp: z.number(),
  selector: z.string().nullable(),
  url: z.string(),
  pageTitle: z.string(),
  elementText: z.string().nullable(),
  elementRole: z.string().nullable(),
  elementType: z.string().nullable(),
  inputValue: z.string().nullable(),
  coordinates: z.object({
    x: z.number(),
    y: z.number(),
    viewportWidth: z.number(),
    viewportHeight: z.number(),
    scrollX: z.number().optional().nullable(),
    scrollY: z.number().optional().nullable(),
    elementRect: z.object({
      top: z.number(),
      left: z.number(),
      width: z.number(),
      height: z.number(),
    }).nullable().optional(),
  }).nullable(),
  screenshotKey: z.string().nullable(),
  stepTitle: z.string().nullable().optional(),
  generatedText: z.string().nullable(),
  textOverride: z.string().nullable(),
  voiceoverKey: z.string().nullable(),
  voiceoverDurationMs: z.number().nullable(),
  originalVoiceoverKey: z.string().nullable().optional(),
  syntheticVoiceoverKey: z.string().nullable().optional(),
  voiceoverSource: z.enum(['original', 'tts', 'swap', 'generating']).nullable().optional(),
  annotations: z.array(AnnotationSchema).optional(),
  animationTarget: AnimationTargetSchema.nullable().optional(),
  cards: z.array(DemoCardSchema).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export type Step = z.infer<typeof StepSchema>;
export type Annotation = z.infer<typeof AnnotationSchema>;
export type AnimationTarget = z.infer<typeof AnimationTargetSchema>;
export type DemoCard = z.infer<typeof DemoCardSchema>;
