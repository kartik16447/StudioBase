// Design tokens for StudioBase Demo Mode editor.
// These mirror the shared zinc-based dark palette used across the studio.

export const zn = {
  bg: '#09090b',
  panel: '#161618',
  panel2: '#1c1c1f',
  border: '#27272a',
  border2: '#323237',
  ink: '#e4e4e7',
  mute: '#a1a1aa',
  dim: '#71717a',
  chip: '#252528',
} as const;

// Placeholder brand color. At runtime this is supplied as a prop and may be
// any tenant accent — design against `brand` only as a default.
export const brand = '#6366f1';

/**
 * Returns a color string with the given alpha applied.
 * NOTE: In the real codebase this already exists in lib/color — kept here so
 * the demo components are self-contained. Swap the import when integrating.
 */
export function withAlpha(color: string, alpha: number): string {
  let h = color.trim();
  if (h.startsWith('#')) {
    h = h.slice(1);
    if (h.length === 3) {
      h = h
        .split('')
        .map((c) => c + c)
        .join('');
    }
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  // Already an rgb()/rgba() string — replace or append alpha.
  const m = h.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(',').map((s) => s.trim());
    const [r, g, b] = parts;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

export const FONT = "Inter, system-ui, sans-serif";
