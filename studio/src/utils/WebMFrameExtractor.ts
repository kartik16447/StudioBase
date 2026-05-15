/**
 * WebMFrameExtractor.ts
 * Phase 3A/4: Atomic Recovery Patch
 * 
 * Ensures that any hardware flush/recovery is immediately followed by a 
 * GOP restart to prevent "Keyframe Required" DataErrors.
 */

import { WebMIndexer } from './WebMIndexer';
import type { IFrameExtractor } from '../modules/render-engine/types';

export class WebMFrameExtractor implements IFrameExtractor {
  private decoder: VideoDecoder | null = null;
  private indexer: WebMIndexer | null = null;
  
  // State Machine
  private lastRequestedIndex: number = -1; 
  private lastFedIndex: number = -1;       
  private isInitialized: boolean = false;
  private videoBuffer: ArrayBuffer | null = null;
  private consecutiveTimeouts: number = 0;
  private activeConfig: VideoDecoderConfig | null = null;
  
  // Cache & Synchronization
  private frameCache: Map<number, VideoFrame> = new Map(); 
  private frameResolvers: Map<number, (frame: VideoFrame | null) => void> = new Map();
  private maxCacheSize: number = 40; 

  constructor() {}

  async init(blob: Blob): Promise<void> {
    this.indexer = new WebMIndexer(blob);
    await this.indexer.init();
    
    this.videoBuffer = await blob.arrayBuffer();
    
    const config = this.indexer.getConfig();
    if (!config) throw new Error("🎬 [Extractor] Failed to extract codec config.");

    const decoderConfig: VideoDecoderConfig = {
      codec: config.codec,
      codedWidth: config.width,
      codedHeight: config.height,
      description: config.description, // Pass extracted CodecPrivate
      hardwareAcceleration: "prefer-software" 
    };

    // --- METADATA SYNTHESIS ---
    // If description is missing, the decoder may default to transparent or fail.
    // Synthesize a canonical VP9 Profile 0, Level 5.1, 8-bit, BT.709 header.
    if (!decoderConfig.description) {
      console.warn("⚠️ [Extractor] CodecPrivate missing. Synthesizing 12-byte VP9 VpcC Box...");
      decoderConfig.description = new Uint8Array([
        0x01,               // Version
        0x00, 0x00, 0x00,   // Flags (3 bytes)
        0x00,               // Profile 0
        0x51,               // Level 5.1 (hex 51 = 81)
        0x08,               // Bit Depth 8
        0x01,               // Chroma Subsampling 4:2:0
        0x00,               // Video Full Range Flag
        0x01,               // Color Primaries: BT.709
        0x01,               // Transfer Characteristics: BT.709
        0x01,               // Matrix Coefficients: BT.709
        0x00                // CodecIntraDataSize (2 bytes, 0 here)
      ]).buffer;
    }

    console.log("🎬 [Extractor] Initializing Decoder with Config:", decoderConfig);
    this.activeConfig = decoderConfig;

    this.decoder = new VideoDecoder({
      output: async (frame) => {
        // --- DIAGNOSTIC RASTER CHECK ---
        // Verify if the frame is actually valid and contains pixel data
        try {
          const bitmap = await createImageBitmap(frame);
          if (bitmap.width === 0 || bitmap.height === 0) {
            console.error(`🔍 [Extractor] Raster Check FAILED: 0x0 frame emitted.`);
          }
          bitmap.close();
        } catch (e) {
          console.error("🔍 [Extractor] Raster Check Exception:", e);
        }

        this.handleOutput(frame);
      },
      error: (e) => console.error("🎬 [Extractor] Decoder Error (Fatal):", e)
    });

    this.decoder.configure(decoderConfig);

    this.isInitialized = true;
    console.log("🎬 [Extractor] Engine Initialized (SOFTWARE MODE). Waiting for first decode...");
  }

  static async checkHardwareSupport(config: VideoDecoderConfig): Promise<VideoDecoderSupport> {
    if (!(window as any).VideoDecoder) {
      throw new Error("WebCodecs not supported");
    }
    return await VideoDecoder.isConfigSupported(config);
  }

  getDuration(): number {
    if (!this.indexer) return 0;
    const frames = this.indexer.getFrames();
    if (frames.length === 0) return 0;
    return frames[frames.length - 1].timestamp;
  }

  async getFrame(timestampMs: number): Promise<VideoFrame | null> {
    if (!this.isInitialized || !this.indexer || !this.decoder) {
      throw new Error("🎬 [Extractor] Engine not initialized.");
    }

    const allFrames = this.indexer.getFrames();
    
    let targetIndex = 0;
    let minDelta = Math.abs(allFrames[0].timestamp - timestampMs);
    for (let i = 0; i < allFrames.length; i++) {
      const delta = Math.abs(allFrames[i].timestamp - timestampMs);
      if (delta < minDelta) {
        minDelta = delta;
        targetIndex = i;
      }
      if (allFrames[i].timestamp > timestampMs + 100) break;
    }

    // 1. Cache Hit Check
    const cachedFrame = this.frameCache.get(targetIndex);
    if (cachedFrame) {
      return cachedFrame.clone();
    }

    // 2. Restart Detection
    const needsRestart = targetIndex < this.lastRequestedIndex || targetIndex > this.lastFedIndex + 100;
    
    if (needsRestart) {
      await this.restartAtKeyframe(targetIndex);
    }

    // 3. Resolve or Wait
    const framePromise = new Promise<VideoFrame | null>((resolve) => {
      this.frameResolvers.set(targetIndex, resolve);
      
      setTimeout(() => {
        if (this.frameResolvers.has(targetIndex)) {
          this.consecutiveTimeouts++;
          console.warn(`🎬 [Extractor] Timeout: Req ${targetIndex}, Fed ${this.lastFedIndex}. Hardware Stall?`);
          this.frameResolvers.delete(targetIndex);
          
          // Atomic Recovery: Consistently restart state machine
          if (this.decoder) {
            console.log("🎬 [Extractor] Recovery: Restarting Sequence...");
            this.restartAtKeyframe(targetIndex).catch(() => {});
          }

          if (this.consecutiveTimeouts >= 5) {
            console.error("🎬 [Extractor] Persistent Decoder Failure. Abandoning frame.");
            this.consecutiveTimeouts = 0;
          }
          resolve(null);
        }
      }, 2500);
    });

    // 4. Pressure Bursts
    const isAlreadyWaiting = targetIndex <= this.lastFedIndex;
    const pressureAmount = isAlreadyWaiting ? 8 : 15; 
    
    const start = this.lastFedIndex + 1;
    const end = Math.min(allFrames.length - 1, targetIndex + pressureAmount);

    if (start <= end) {
      for (let i = start; i <= end; i++) {
        if (this.decoder.decodeQueueSize > 12) {
          await new Promise(r => setTimeout(r, 10));
        }

        const entry = allFrames[i];
        if (!entry) continue;

        // --- DIAGNOSTIC PAYLOAD AUDIT ---
        // Log first few frames and periodically to verify payload integrity
        // Silencing high-frequency audit logs
        /*
        if (i <= 5 || i === targetIndex || i % 100 === 0) {
          ...
        }
        */

        const chunk = new EncodedVideoChunk({
          type: entry.isKeyframe ? 'key' : 'delta',
          timestamp: entry.timestamp * 1000, // Microseconds
          data: new Uint8Array(this.videoBuffer!, entry.offset, entry.size)
        });
        
        try {
          if (this.decoder.state === "closed") {
            console.error("🎬 [Extractor] Decoder closed unexpectedly.");
            break;
          }
          this.decoder.decode(chunk);
          this.lastFedIndex = i;
        } catch (e) {
          console.error("🎬 [Extractor] Decode Exception (Chunk Submission):", e);
          this.restartAtKeyframe(targetIndex).catch(() => {});
          break;
        }
      }
      
      // Pressure Burst logged only on error
    }

    this.lastRequestedIndex = targetIndex;
    return framePromise;
  }

  private handleOutput(frame: VideoFrame) {
    // Silencing high-frequency output logs
    const index = this.findFrameIndexByTimestamp(frame.timestamp / 1000);

    if (index === -1) {
      frame.close();
      return;
    }

    this.consecutiveTimeouts = 0;
    const resolver = this.frameResolvers.get(index);
    
    if (resolver) {
      this.frameResolvers.delete(index);
      resolver(frame.clone());
    }
    this.addToCache(index, frame);
  }

  private findFrameIndexByTimestamp(ts: number): number {
    if (!this.indexer) return -1;
    const frames = this.indexer.getFrames();
    // Allow small epsilon for floating point timestamp matching
    return frames.findIndex(f => Math.abs(f.timestamp - ts) < 0.1);
  }

  private addToCache(index: number, frame: VideoFrame) {
    if (this.frameCache.size >= this.maxCacheSize) {
      const oldestIndex = Array.from(this.frameCache.keys()).sort((a, b) => a - b)[0];
      const oldestFrame = this.frameCache.get(oldestIndex);
      oldestFrame?.close();
      this.frameCache.delete(oldestIndex);
    }
    this.frameCache.set(index, frame);
  }

  private async restartAtKeyframe(targetIndex: number) {
    if (!this.indexer || !this.decoder || !this.activeConfig) return;
    const allFrames = this.indexer.getFrames();
    
    let keyIndex = 0;
    for (let i = targetIndex; i >= 0; i--) {
      if (allFrames[i].isKeyframe) {
        keyIndex = i;
        break;
      }
    }

    this.decoder.reset();
    this.decoder.configure(this.activeConfig);

    this.cleanupCache();
    this.lastFedIndex = keyIndex - 1; 
  }

  private cleanupCache() {
    this.frameCache.forEach(f => f.close());
    this.frameCache.clear();
    this.frameResolvers.clear();
  }

  async destroy() {
    this.cleanupCache();
    if (this.decoder && this.decoder.state !== "closed") {
      this.decoder.close();
    }
    this.videoBuffer = null;
    this.isInitialized = false;
  }
}
