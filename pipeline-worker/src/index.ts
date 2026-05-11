import { GoogleGenerativeAI } from '@google/generative-ai';
import type { SessionEnvelope, Step } from '../../shared/types/session';

interface Env {
  R2: R2Bucket;
  DB: D1Database;
  GEMINI_API_KEY: string;
  ENABLE_TEXT_GEN: string; // "true" | "false"
  ENABLE_TTS: string;      // "true" | "false"
}

interface TTSResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          mimeType: string;
          data: string;
        }
      }>
    }
  }>
}

interface PipelineMessage {
  sessionId: string;
  r2JsonKey: string;
  workspaceId: string;
}

export default {
  async queue(batch: MessageBatch<PipelineMessage>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        await processSession(msg.body, env);
        msg.ack();
      } catch (err) {
        console.error('Pipeline error:', err);
        msg.retry();
      }
    }
  }
};

async function processSession(msg: PipelineMessage, env: Env) {
  const { sessionId, r2JsonKey, workspaceId } = msg;

  // Step 1 — Read session JSON from R2
  const obj = await env.R2.get(r2JsonKey);
  if (!obj) throw new Error(`R2 key not found: ${r2JsonKey}`);
  const session: SessionEnvelope = await obj.json();

  // Step 2 — Init Gemini
  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

  // Step 3 — Per-step: generate text + voiceover sequentially
  for (const step of session.steps) {
    // 3a. Generate step text with Gemini
    let generatedText = '';
    if (env.ENABLE_TEXT_GEN !== 'true' || !step.elementText?.trim()) {
      generatedText = step.elementText || 'Clicked element';
      step.generatedText = generatedText;
    } else try {
      const prompt = `You are writing step-by-step instructions for a software walkthrough guide.

Context:
- Page URL: ${step.url}
- Element clicked: ${step.elementText}
- CSS selector: ${step.selector}
- Action type: ${step.action}

Write ONE clear, concise instruction sentence (max 20 words) describing what the user did.
Start with an action verb. Be specific about the element name.
Return only the sentence, no punctuation at end, no quotes.`;

      const result = await model.generateContent(prompt);
      generatedText = result.response.text().trim();
    } catch (err) {
      console.error(`Gemini failed for step ${step.id}:`, err);
      generatedText = step.elementText || 'Clicked element';
    }
    step.generatedText = generatedText;

    console.log(`[${step.id}] generatedText: "${generatedText}"`);

    // 3b. Generate voiceover using Gemini TTS
    const audio = env.ENABLE_TTS === 'true' ? await synthesizeSpeech(generatedText, env) : null;

    // 3c. If audio returned, upload to R2
    if (audio) {
      const voiceKey = `voiceovers/${workspaceId}/${sessionId}/${step.id}.wav`;
      await env.R2.put(voiceKey, audio, {
        httpMetadata: { contentType: 'audio/wav' }
      });
      step.voiceoverKey = voiceKey;
    } else {
      step.voiceoverKey = null;
    }

    // Step 4 — Compute animationTarget per step
    step.animationTarget = {
      centerX: step.coordinates?.x ?? 50,
      centerY: step.coordinates?.y ?? 50,
      zoomScale: 2.5,
      transitionType: 'fade', // canonical schema uses 'fade' instead of 'crossfade'
      transitionDurationMs: 400
    };

    // 3d. Rate limiting / courtesy sleep
    await sleep(200);
  }

  // Step 5 — Generate session-level AI outputs (one Gemini call)
  try {
    const sessionPrompt = `Given these step instructions:
${session.steps.map((s, i) => `${i + 1}. ${s.generatedText}`).join('\n')}

Return a JSON object with:
- title: string (5-8 words, describes what this walkthrough accomplishes)
- summary: string (1-2 sentences, what user will learn)
- tags: string[] (3-5 relevant keywords)

Return only valid JSON, no markdown.`;

    const result = await model.generateContent(sessionPrompt);
    const jsonStr = result.response.text().replace(/```json|```/g, '').trim();
    const aiData = JSON.parse(jsonStr);
    
    session.aiOutputs = {
      title: aiData.title || 'Untitled Walkthrough',
      summary: aiData.summary || '',
      tags: aiData.tags || []
    };
  } catch (err) {
    console.error('Session-level AI failed:', err);
    session.aiOutputs = {
      title: 'Untitled Walkthrough',
      summary: '',
      tags: []
    };
  }

  // Step 6 — Write enriched session JSON back to R2
  await env.R2.put(r2JsonKey, JSON.stringify(session), {
    httpMetadata: { contentType: 'application/json' }
  });

  // Step 7 — Update D1 status
  await env.DB.prepare(
    'UPDATE sessions SET status = ?, updatedAt = ? WHERE id = ?'
  ).bind('ready', Date.now(), sessionId).run();
}

async function synthesizeSpeech(text: string, env: Env): Promise<ArrayBuffer | null> {
  try {
    const safeText = text.length > 200 ? text.slice(0, 197) + '...' : text;
    if (!safeText.trim()) return null;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: safeText }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Aoede' }
              }
            }
          }
        })
      }
    );

    if (!res.ok) {
      console.error('Gemini TTS error:', await res.text());
      return null;
    }

    const data = await res.json() as TTSResponse;
    const part = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!part?.data) return null;

    const mimeType = part.mimeType ?? '';
    console.log('TTS mimeType:', mimeType);

    const binary = atob(part.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    // If already WAV (starts with RIFF), return as-is
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
      return bytes.buffer;
    }

    // Raw PCM — wrap with WAV header (24000 Hz, mono, 16-bit)
    return buildWav(bytes, 24000, 1, 16);
  } catch (err) {
    console.error('TTS failed silently:', err);
    return null;
  }
}

function buildWav(pcm: Uint8Array, sampleRate: number, channels: number, bitDepth: number): ArrayBuffer {
  const byteRate = sampleRate * channels * (bitDepth / 8);
  const blockAlign = channels * (bitDepth / 8);
  const dataSize = pcm.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const enc = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  enc(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  enc(8, 'WAVE');
  enc(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);           // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  enc(36, 'data');
  view.setUint32(40, dataSize, true);
  new Uint8Array(buffer, 44).set(pcm);

  return buffer;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
