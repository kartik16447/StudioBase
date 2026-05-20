export interface RenderSpec {
  dimensions: { width: number; height: number };
  step: any;
  prevStep: any | null;
  /** 0→1 animation progress for overlays / effects that need to know timing */
  progress: number;
  theme: {
    primaryColor: string;
    logoUrl?: string;
    watermark?: string;
  };
  renderMode: string;
  /**
   * Live camera state, driven by springs in preview and by a spring-sim in export.
   * pctX / pctY are percentages of the screenshot's OWN dimensions (0–100).
   * When omitted the renderer reads from step.coordinates (useful for static frames).
   */
  camera?: {
    pctX: number;
    pctY: number;
    scale: number;
  };
  /** Wall-clock or simulated time in ms — drives background shimmer animation */
  timeMs?: number;
  /**
   * Whether to draw the cursor dot/ripple overlay.
   * Default: true (export pipeline shows click indicator).
   * Set false for live player — camera pan already communicates the click point,
   * and the static dot creates a confusing second cursor.
   */
  showCursor?: boolean;
}

export interface IRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    spec: RenderSpec,
    masterFrame: ImageBitmap | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null,
  ): void | Promise<void>;
}

export interface IFrameExtractor {
  init(url: string | Blob): Promise<void>;
  getFrame(timestampMs: number): Promise<any>;
  getDuration(): number;
  destroy(): Promise<void>;
}
