import { brand as defaultBrand } from './tokens';

export type SpotlightShape = 'square' | 'rounded' | 'circle';

export type SpotlightMaskProps = {
  /** Hole rect, as percentages of the screenshot container. */
  rect: { x: number; y: number; w: number; h: number };
  shape: SpotlightShape;
  /** 0–100. Darkness of the surrounding dim layer. */
  overlayOpacity: number;
  borderColor?: string;
  onClick?: (e: React.MouseEvent) => void;
};

function radiusFor(shape: SpotlightShape): string {
  switch (shape) {
    case 'square':
      return '0px';
    case 'rounded':
      return '10px';
    case 'circle':
      return '50%';
  }
}

/**
 * Full-canvas dimming layer with a cut-out "hole" at `rect`. Pure visual —
 * repositioning/resizing is handled externally. The hole is produced with the
 * classic huge box-shadow trick so the dim layer renders in a single element.
 */
export function SpotlightMask({
  rect,
  shape,
  overlayOpacity,
  borderColor = defaultBrand,
  onClick,
}: SpotlightMaskProps) {
  const dim = Math.max(0, Math.min(100, overlayOpacity)) / 100;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 15,
      }}
    >
      <div
        onClick={onClick}
        className="spotlight-cutout"
        style={{
          position: 'absolute',
          left: `${rect.x}%`,
          top: `${rect.y}%`,
          width: `${rect.w}%`,
          height: `${rect.h}%`,
          borderRadius: radiusFor(shape),
          boxShadow: `0 0 0 9999px rgba(0,0,0,${dim})`,
          outline: `2px solid ${borderColor}`,
          outlineOffset: -1,
          pointerEvents: onClick ? 'auto' : 'none',
          cursor: onClick ? 'pointer' : 'default',
          transition: 'left 120ms, top 120ms, width 120ms, height 120ms, border-radius 120ms, outline-color 150ms',
        }}
      />
      <style>{`
        .spotlight-cutout:hover {
          outline-color: #ffffff !important;
          outline-width: 2.5px !important;
        }
      `}</style>
    </div>
  );
}

export default SpotlightMask;
