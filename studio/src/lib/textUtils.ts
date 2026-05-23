/**
 * Strip audio-only markers from text before displaying in the UI.
 * "..." and "[SILENCE]" are meaningful for TTS pacing but look wrong as visible text.
 */
export function displayText(raw: string | null | undefined): string {
  if (!raw) return '';
  if (raw.trim() === '[SILENCE]') return '';
  return raw.trimEnd().replace(/\.{2,}$/, '').trimEnd();
}
