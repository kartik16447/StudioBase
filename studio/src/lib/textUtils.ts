/**
 * Strip audio-only markers from a raw generatedText/textOverride string
 * before displaying it in the UI.
 * "..." and "[SILENCE]" are meaningful for TTS pacing but look wrong as visible text.
 */
export function stripAudioMarkers(raw: string | null | undefined): string {
  if (!raw) return '';
  if (raw.trim() === '[SILENCE]') return '';
  return raw.trimEnd().replace(/\.{2,}$/, '').trimEnd();
}

/**
 * Resolve the best display text for a step, in priority order:
 *  1. textOverride — user manually edited text (always wins)
 *  2. displayText  — AI-generated clean readable sentence (new pipeline field)
 *  3. generatedText stripped of audio markers — fallback for older sessions
 */
export function resolveDisplayText(step: {
  textOverride?: string | null;
  displayText?: string | null;
  generatedText?: string | null;
}): string {
  if (step.textOverride) return stripAudioMarkers(step.textOverride);
  if (step.displayText)  return step.displayText;
  return stripAudioMarkers(step.generatedText);
}

/** @deprecated use resolveDisplayText() or stripAudioMarkers() instead */
export const displayText = stripAudioMarkers;
