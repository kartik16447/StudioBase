import { WebMFrameExtractor } from '../utils/WebMFrameExtractor';

const extractor = new WebMFrameExtractor();

const ctx: Worker = self as any;

// Resolves once INIT completes; GET_FRAME requests await this before running.
let readyResolve: (() => void) | null = null;
let readyReject: ((e: Error) => void) | null = null;
const readyPromise: Promise<void> = new Promise((res, rej) => {
  readyResolve = res;
  readyReject = rej;
});

ctx.onmessage = async (e: MessageEvent) => {
  const { type, payload, requestId } = e.data;

  try {
    switch (type) {
      case 'INIT': {
        const { url } = payload;
        const response = await fetch(url);
        const blob = await response.blob();
        await extractor.init(blob);
        const duration = extractor.getDuration();
        readyResolve!();
        ctx.postMessage({ type: 'INIT_SUCCESS', payload: { duration }, requestId });
        break;
      }

      case 'CHECK_SUPPORT': {
        const { config } = payload;
        const support = await WebMFrameExtractor.checkHardwareSupport(config);
        ctx.postMessage({ type: 'SUPPORT_RESULT', payload: support, requestId });
        break;
      }

      case 'GET_FRAME': {
        await readyPromise;
        const { timestampMs } = payload;
        const frame = await extractor.getFrame(timestampMs);

        if (frame) {
          const bitmap = await createImageBitmap(frame);
          frame.close();
          ctx.postMessage(
            { type: 'FRAME_SUCCESS', payload: { bitmap, timestampMs }, requestId },
            [bitmap]
          );
        } else {
          ctx.postMessage({ type: 'FRAME_ERROR', payload: { error: 'No frame found' }, requestId });
        }
        break;
      }

      case 'DESTROY': {
        await extractor.destroy();
        ctx.postMessage({ type: 'DESTROY_SUCCESS', requestId });
        break;
      }

      default:
        console.warn(`[ExtractorWorker] Unknown message type: ${type}`);
    }
  } catch (error: any) {
    if (type === 'INIT') readyReject!(new Error(error.message || 'Init failed'));
    ctx.postMessage({
      type: 'ERROR',
      payload: { error: error.message || 'Unknown worker error' },
      requestId,
    });
  }
};
