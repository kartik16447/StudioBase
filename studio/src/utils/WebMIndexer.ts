/**
 * WebMIndexer.ts
 * Step 1: Standalone EBML Parser and Indexer
 * 
 * Provides deterministic mapping of timestamps to byte offsets and keyframe detection.
 */

export interface WebMFrameEntry {
  timestamp: number;     // Absolute timestamp in milliseconds
  offset: number;        // Byte offset in the blob
  size: number;          // Chunk size in bytes
  isKeyframe: boolean;
  clusterTimecode: number;
}

export interface CodecConfig {
  codec: string;
  width: number;
  height: number;
  description?: ArrayBuffer;
}

export class WebMIndexer {
  private view: DataView | null = null;
  private frames: WebMFrameEntry[] = [];
  private config: CodecConfig | null = null;
  private timecodeScale: number = 1000000; // Default 1ms in nanoseconds

  private blob: Blob;

  constructor(blob: Blob) {
    this.blob = blob;
  }

  /**
   * Initializes the index by scanning the EBML structure.
   */
  async init(): Promise<void> {
    const buffer = await this.blob.arrayBuffer();
    this.view = new DataView(buffer);
    console.log("🎬 [Indexer] Starting Hierarchy-Aware Scan (v2.1)...");
    this.parseEBML(0, buffer.byteLength, false);
    this.view = null; // PHASE A: Release DataView/ArrayBuffer after indexing
    console.log(`🎬 [Indexer] Indexing complete. Found ${this.frames.length} frames.`);
  }

  public getFrames() { return this.frames; }
  public getConfig() { return this.config; }

  /**
   * EBML Parsing Logic
   */
  private parseEBML(start: number, end: number, isCluster: boolean = false) {
    if (!this.view) return;
    let pos = start;
    while (pos < end) {
      const id = this.readVint(pos, false); // IDs keep the length bit
      if (!id) break;
      pos += id.length;

      const size = this.readVint(pos, true); // Sizes strip the length bit
      if (!size) break;
      pos += size.length;

      const elementId = id.value;
      const elementSize = size.value;

      // --- DISCRIMINATOR: Containers vs Leaves ---
      switch (elementId) {
        case 0x18538067: // Segment
          console.log(`🎬 [Indexer] Container: Segment (Size: ${elementSize})`);
          this.parseEBML(pos, pos + elementSize, false);
          break;
        case 0x1549A966: // Info
          console.log(`🎬 [Indexer] Container: Info (Size: ${elementSize})`);
          this.parseEBML(pos, pos + elementSize, false);
          break;
        case 0x1654AE6B: // Tracks
          console.log(`🎬 [Indexer] Container: Tracks (Size: ${elementSize})`);
          this.parseEBML(pos, pos + elementSize, false);
          break;
        case 0xAE:       // TrackEntry
          this.parseEBML(pos, pos + elementSize, false);
          break;
        case 0xE0:       // Video
          this.parseEBML(pos, pos + elementSize, false);
          break;

        case 0x1F43B675: // Cluster
          console.log(`🎬 [Indexer] Container: Cluster @ ${pos - id.length - size.length} (Size: ${elementSize})`);
          this.parseEBML(pos, pos + elementSize, true);
          break;

        case 0x2AD7B1:   // TimecodeScale
          this.timecodeScale = this.readInt(pos, elementSize);
          break;

        case 0x86:       // CodecID
          const codecId = this.readString(pos, elementSize);
          if (!this.config) this.config = { codec: '', width: 0, height: 0 };
          this.config.codec = this.mapCodecId(codecId);
          break;

        case 0xB0:       // PixelWidth
          if (!this.config) this.config = { codec: '', width: 0, height: 0 };
          this.config.width = this.readInt(pos, elementSize);
          break;

        case 0xBA:       // PixelHeight
          if (!this.config) this.config = { codec: '', width: 0, height: 0 };
          this.config.height = this.readInt(pos, elementSize);
          break;

        case 0xE7:       // Cluster Timecode
          this.currentClusterTimecode = this.readInt(pos, elementSize);
          break;



        case 0xA3:       // SimpleBlock
        case 0xA1:       // Block
          if (isCluster) {
            this.parseBlock(pos, elementSize);
          } else {
            const hex = Array.from(new Uint8Array(this.view.buffer, pos, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ');
            console.warn(`⚠️ [Indexer] Found potential Block ID (0x${elementId.toString(16)}) OUTSIDE cluster at ${pos}. Data: ${hex}`);
          }
          break;

        case 0x63A2:     // CodecPrivate
          console.log(`🎬 [Indexer] Found CodecPrivate (Size: ${elementSize})`);
          if (!this.config) this.config = { codec: '', width: 0, height: 0 };
          this.config.description = this.view.buffer.slice(pos, pos + elementSize) as ArrayBuffer;
          break;
      }

      pos += elementSize;
    }
  }

  private currentClusterTimecode: number = 0;

  /**
   * Block/SimpleBlock Parsing
   * [Track VINT] [Timecode signed 16-bit] [Flags 8-bit] ([Lacing]) [Data]
   */
  private parseBlock(start: number, size: number) {
    if (!this.view) return;
    let pos = start;

    const track = this.readVint(pos, true);
    if (!track) return;
    pos += track.length;

    // Timecode (relative to Cluster Timecode)
    const blockTimecode = this.view.getInt16(pos);
    pos += 2;

    // Flags
    const flags = this.view.getUint8(pos);
    const isKeyframe = (flags & 0x80) !== 0;
    const lacingType = (flags & 0x06) >> 1; // 00: None, 01: Xiph, 11: EBML, 10: Fixed
    pos += 1;

    // Lacing Handling
    if (lacingType !== 0) {
      const numFramesMinusOne = this.view.getUint8(pos);
      pos += 1;
      
      if (lacingType === 1) { // Xiph
        for (let i = 0; i < numFramesMinusOne; i++) {
          let laceSize = 0;
          let laceByte = 0;
          do {
            laceByte = this.view.getUint8(pos);
            laceSize += laceByte;
            pos += 1;
          } while (laceByte === 255);
        }
      } else if (lacingType === 2) { // Fixed
        // Nothing extra to read
      } else if (lacingType === 3) { // EBML
        for (let i = 0; i < numFramesMinusOne; i++) {
          const laceVint = this.readVint(pos, true);
          if (laceVint) pos += laceVint.length;
        }
      }
    }

    const dataOffset = pos;
    const dataSize = size - (pos - start);

    // Absolute timestamp calculation
    const timestamp = (this.currentClusterTimecode + blockTimecode) * (this.timecodeScale / 1000000);

    if (this.frames.length < 5) {
      console.log(`🎬 [Indexer] Pushing Frame: TS=${timestamp}, Offset=${dataOffset}, HeaderSize=${dataOffset - start}`);
    }

    this.frames.push({
      timestamp,
      offset: dataOffset,
      size: dataSize,
      isKeyframe,
      clusterTimecode: this.currentClusterTimecode
    });
  }

  /**
   * EBML Helper: Read Variable-Length Integer
   */
  private readVint(pos: number, mask: boolean): { value: number, length: number } | null {
    if (!this.view || pos >= this.view.byteLength) return null;
    const firstByte = this.view.getUint8(pos);
    let length = 0;
    for (let i = 0; i < 8; i++) {
      if (firstByte & (0x80 >> i)) {
        length = i + 1;
        break;
      }
    }
    if (length === 0) return null;

    let value = mask ? (firstByte & (0xFF >> length)) : firstByte;
    for (let i = 1; i < length; i++) {
      // Use Number multiplication instead of bitwise to avoid 32-bit overflow
      value = (value * 256) + this.view.getUint8(pos + i);
    }
    return { value, length };
  }

  private readInt(pos: number, size: number): number {
    if (!this.view) return 0;
    let val = 0;
    for (let i = 0; i < size; i++) {
      val = (val * 256) + this.view.getUint8(pos + i);
    }
    return val;
  }

  private readString(pos: number, size: number): string {
    if (!this.view) return "";
    let str = "";
    for (let i = 0; i < size; i++) {
      str += String.fromCharCode(this.view.getUint8(pos + i));
    }
    return str;
  }

  private mapCodecId(id: string): string {
    if (id === "V_VP8") return "vp8";
    if (id === "V_VP9") return "vp09.00.10.08";
    if (id === "V_MPEG4/ISO/AVC") return "avc1.42E01E";
    return id;
  }

  /**
   * Validates codec support via browser capability API
   */
  async validateSupport(): Promise<boolean> {
    if (!this.config) return false;
    const support = await (self as any).VideoDecoder.isConfigSupported({
      codec: this.config.codec,
      hardwareAcceleration: "prefer-hardware",
      codedWidth: this.config.width,
      codedHeight: this.config.height
    });
    console.log(`🎬 [Indexer] Codec Support (${this.config.codec}):`, support.supported ? "✅" : "❌");
    return !!support.supported;
  }
}
