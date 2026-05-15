/**
 * WorkerExtractor.ts
 * Main Thread Bridge for the Off-Thread Frame Extraction Worker
 */

export class WorkerExtractor {
  private worker: Worker;
  private pendingRequests: Map<string, { resolve: (val: any) => void, reject: (err: any) => void }> = new Map();
  private duration: number = 0;

  constructor() {
    this.worker = new Worker(
      new URL('../workers/extractor.worker.ts', import.meta.url),
      { type: 'module' }
    );

    this.worker.onmessage = (e: MessageEvent) => {
      const { type, payload, requestId } = e.data;
      const request = this.pendingRequests.get(requestId);

      if (!request) return;

      switch (type) {
        case 'INIT_SUCCESS':
          this.duration = payload?.duration || 0;
          request.resolve(payload);
          this.pendingRequests.delete(requestId);
          break;

        case 'DESTROY_SUCCESS':
          request.resolve(payload);
          this.pendingRequests.delete(requestId);
          break;

        case 'SUPPORT_RESULT':
          request.resolve(payload);
          this.pendingRequests.delete(requestId);
          break;

        case 'FRAME_SUCCESS':
          if (payload && payload.bitmap) {
            request.resolve(payload.bitmap);
          } else {
            request.reject(new Error('Worker sent FRAME_SUCCESS but payload.bitmap is missing'));
          }
          this.pendingRequests.delete(requestId);
          break;

        case 'FRAME_ERROR':
        case 'ERROR':
          request.reject(new Error(payload?.error || 'Unknown worker error'));
          this.pendingRequests.delete(requestId);
          break;
      }
    };

    this.worker.onerror = (e) => {
      console.error('[WorkerExtractor] Worker Global Error:', e);
    };
  }

  private sendRequest(type: string, payload: any = {}): Promise<any> {
    const requestId = Math.random().toString(36).substring(7);
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
      this.worker.postMessage({ type, payload, requestId });
    });
  }

  async init(url: string): Promise<void> {
    return this.sendRequest('INIT', { url });
  }

  async getFrame(timestampMs: number): Promise<ImageBitmap | null> {
    try {
      return await this.sendRequest('GET_FRAME', { timestampMs });
    } catch (e) {
      console.error(`[WorkerExtractor] Failed to get frame at ${timestampMs}ms:`, e);
      return null;
    }
  }

  getDuration(): number {
    return this.duration;
  }

  async destroy(): Promise<void> {
    await this.sendRequest('DESTROY');
    this.worker.terminate();
    this.pendingRequests.clear();
  }

  async checkSupport(config: any): Promise<any> {
    return this.sendRequest('CHECK_SUPPORT', { config });
  }
}
