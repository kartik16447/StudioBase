export interface RenderSpec {
  dimensions: { width: number; height: number };
  step: any; // Ideally typed to StepRow or StepContent
  prevStep: any | null;
  progress: number;
  theme: {
    primaryColor: string;
    logoUrl?: string;
    watermark?: string;
  };
  renderMode: string;
}

export interface IRenderer {
  render(ctx: CanvasRenderingContext2D, spec: RenderSpec, masterFrame: ImageBitmap | HTMLImageElement | HTMLVideoElement | null): void | Promise<void>;
}

export interface IFrameExtractor {
  init(url: string | Blob): Promise<void>;
  getFrame(timestampMs: number): Promise<any>;
  getDuration(): number;
  destroy(): Promise<void>;
}
