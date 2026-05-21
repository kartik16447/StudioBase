export interface AudioResult {
  buffer: ArrayBuffer;
  mimeType: string;
  durationMs: number;
}

export interface IAudioService {
  generateFromText(text: string, options?: { voiceId?: string; language?: string }): Promise<AudioResult>;
  swapVoice?(audioBuffer: ArrayBuffer, voiceId: string): Promise<AudioResult>;
}
