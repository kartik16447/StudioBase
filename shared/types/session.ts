// ============================================================
// STUDIOBASE — CANONICAL SESSION SCHEMA
// Version: 1.0
// This is the single source of truth for all data structures.
// Both the extension and the Studio import from here.
// Never change field names without bumping SCHEMA_VERSION.
// ============================================================

export const SCHEMA_VERSION = "1.0";

// ─── Action Types ───────────────────────────────────────────

export type ActionType =
  | "click"
  | "input"
  | "scroll"
  | "navigate"
  | "keypress"
  | "iframe_blocked";

export type TransitionType = "slide" | "fade" | "zoom" | "instant";

export type PipelinePath = "edge" | "cloud" | "pending";

export type SessionType = "steps" | "video";

export type SessionStatus =
  | "capturing"
  | "uploading"
  | "processing"
  | "ready"
  | "failed"
  | "credit_exhausted";

// ─── Geometry ───────────────────────────────────────────────

export interface ElementRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Coordinates {
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
  scrollX: number;
  scrollY: number;
  elementRect: ElementRect | null;
}

// ─── Animation (computed by pipeline, consumed by Studio video view) ────────

export interface AnimationTarget {
  centerX: number;         // click point x as % of viewport width (0-100)
  centerY: number;         // click point y as % of viewport height (0-100)
  zoomScale: number;       // how much to zoom in (1.0 = no zoom, 2.5 = default)
  transitionType: TransitionType;
  transitionDurationMs: number;
}

// ─── Path 3 — Debug / Bug Capture ───────────────────────────

export interface ConsoleLine {
  level: "log" | "warn" | "error" | "info";
  message: string;
  timestamp: number;
}

export interface NetworkRequest {
  url: string;
  method: string;
  status: number | null;
  durationMs: number | null;
  requestBody?: string;
  responsePreview?: string;
}

export interface JSError {
  message: string;
  stack: string | null;
  timestamp: number;
}

export interface DebugCapture {
  consoleLogs: ConsoleLine[];
  networkRequests: NetworkRequest[];
  jsErrors: JSError[];
}

// ─── Path 4 — Automation Scripts ────────────────────────────

export interface AutomationActions {
  playwright: string | null;
  puppeteer: string | null;
}

// ─── Path 5 — Memory / Search ───────────────────────────────

export interface MemoryMeta {
  embeddingId: string;
  vectorStoreKey: string;
  pageContentHash: string;
}

// ─── Path 6 — eLearning / Courseware ────────────────────────

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface CoursewareMeta {
  objective: string;
  quiz?: QuizQuestion;
  isBranchPoint: boolean;
}

// ─── Path 7 — Template / Marketplace ────────────────────────

export interface TemplateMeta {
  slotName: string | null;
  isVariable: boolean;
  variableDescription: string | null;
}

// ─── Path 8 — Guided Tour Overlay (Chameleon-style) ─────────

export interface OverlayTrigger {
  urlPattern: string;       // glob pattern e.g. "https://app.salesforce.com/*"
  triggerOn: "visit" | "element_visible" | "manual";
  targetSelector?: string;
}

export interface OverlayDisplay {
  tooltipText: string;
  tooltipPosition: "top" | "bottom" | "left" | "right";
  highlightElement: boolean;
  showStepCounter: boolean;
  allowSkip: boolean;
}

export interface OverlayMeta {
  trigger: OverlayTrigger;
  display: OverlayDisplay;
}

// ─── Core Step Object ───────────────────────────────────────

export interface Step {
  id: string;
  sequence: number;          // 1-indexed display order
  timestamp: number;         // ms since session start
  action: ActionType;
  url: string;
  pageTitle: string;

  // Element capture
  selector: string | null;
  elementText: string | null;
  elementRole: string | null;
  elementType: string | null;
  inputValue: string | null;

  // Geometry
  coordinates: Coordinates | null;

  // Screenshot — key into SessionEnvelope.assets, NEVER a direct URL
  screenshotKey: string;

  // AI pipeline outputs (null until pipeline runs)
  generatedText: string | null;
  textOverride: string | null;   // user edited this in Studio
  voiceoverKey: string | null;
  voiceoverDurationMs: number | null;
  animationTarget: AnimationTarget | null;

  // Future paths — undefined until their path is built
  debug?: DebugCapture;
  automation?: AutomationActions;
  memory?: MemoryMeta;
  courseware?: CoursewareMeta;
  template?: TemplateMeta;
  overlay?: OverlayMeta;
}

// ─── Session Envelope ───────────────────────────────────────

export interface SessionAssets {
  [r2Key: string]: string;   // R2 object key → signed CDN URL (refreshed on load)
}

export interface SessionAIOutputs {
  title: string | null;
  summary: string | null;
  tags: string[];
}

export interface SessionMetadata {
  durationMs: number;
  stepCount: number;
  // Path 6
  scorm?: {
    courseId: string;
    objectives: string[];
    passingScore: number;
  };
  // Path 7
  template?: {
    templateId: string | null;
    parentTemplateId: string | null;
    forkDepth: number;
    isPublished: boolean;
  };
}

export interface SessionEnvelope {
  sessionId: string;
  schemaVersion: string;      // locked to SCHEMA_VERSION constant
  sessionType: SessionType;   // "steps" = new capture engine, "video" = raw recording
  capturedAt: string;         // ISO 8601
  capturedUrl: string;
  capturedTitle: string;
  userAgent: string;
  pipelinePath: PipelinePath;
  steps: Step[];
  assets: SessionAssets;
  aiOutputs: SessionAIOutputs;
  metadata: SessionMetadata;
}
