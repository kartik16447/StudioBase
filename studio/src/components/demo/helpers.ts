export function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function withAlpha(hex: string, a: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function brandGradient(brand: string, intensity = 0.5) {
  const a = 0.04 + intensity * 0.22;
  return `radial-gradient(120% 80% at 50% -10%, ${withAlpha(brand, a)} 0%, rgba(10,10,11,0) 55%), #08080a`;
}
