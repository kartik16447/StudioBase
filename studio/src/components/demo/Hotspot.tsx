import React from 'react';
import { withAlpha } from './helpers';

export type HotspotStyle = 'pulse' | 'filled' | 'ring' | 'arrow';

interface HotspotProps {
  style?: HotspotStyle;
  brand?: string;
  size?: number;
  x?: number;       // percent — if provided, positions absolutely
  y?: number;
  handles?: boolean; // show drag corner handles (studio only)
  white?: boolean;   // force white core (for light screenshots)
  onClick?: () => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  title?: string;
}

export const Hotspot: React.FC<HotspotProps> = ({
  style = 'pulse',
  brand = '#6366f1',
  size = 18,
  x,
  y,
  handles = false,
  white = false,
  onClick,
  onMouseDown,
  title,
}) => {
  const core = white ? '#ffffff' : brand;
  const ringColor = white ? 'rgba(255,255,255,0.85)' : brand;

  const wrap: React.CSSProperties = {
    position: x != null ? 'absolute' : 'relative',
    left: x != null ? `${x}%` : undefined,
    top: y != null ? `${y}%` : undefined,
    width: size,
    height: size,
    transform: 'translate(-50%,-50%)',
    zIndex: 20,
    cursor: onClick ? 'pointer' : 'default',
  };

  const dot = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    boxShadow: white
      ? '0 2px 10px rgba(0,0,0,0.45)'
      : `0 2px 12px ${withAlpha(brand, 0.6)}`,
    ...extra,
  });

  let inner: React.ReactNode = null;

  if (style === 'pulse') {
    inner = (
      <>
        <span style={{ ...dot({ background: ringColor }), animation: 'dm-pulse-ring 2s ease-out infinite' }} />
        <span style={{ ...dot({ background: ringColor }), animation: 'dm-pulse-ring 2s ease-out infinite', animationDelay: '1s' }} />
        <span style={{ ...dot({ background: core, border: white ? '2px solid rgba(0,0,0,0.12)' : 'none', animation: 'dm-core-beat 2s ease-in-out infinite' }) }} />
      </>
    );
  } else if (style === 'filled') {
    inner = (
      <span style={dot({ background: core, border: `2px solid ${withAlpha('#ffffff', white ? 0.6 : 0.25)}` })} />
    );
  } else if (style === 'ring') {
    inner = (
      <>
        <span style={dot({ background: 'transparent', border: `${Math.max(2, size * 0.18)}px solid ${core}` })} />
        <span style={dot({
          width: '32%',
          height: '32%',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%,-50%)',
          background: core,
          boxShadow: 'none',
        })} />
      </>
    );
  } else if (style === 'arrow') {
    inner = (
      <span style={{
        position: 'absolute',
        left: '50%',
        top: -size * 1.6,
        transform: 'translate(-50%, 0)',
        animation: 'dm-arrow-bob 1.2s ease-in-out infinite',
        color: core,
        filter: white
          ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))'
          : `drop-shadow(0 2px 8px ${withAlpha(brand, 0.6)})`,
      }}>
        <svg width={size * 1.5} height={size * 1.8} viewBox="0 0 24 30" fill="currentColor">
          <path d="M12 30 4 18h5V2h6v16h5z" />
        </svg>
      </span>
    );
  }

  return (
    <span style={wrap} onClick={onClick} onMouseDown={onMouseDown} title={title} role={onClick ? 'button' : undefined}>
      {inner}
      {handles && (
        <span style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: size + 22,
          height: size + 22,
          transform: 'translate(-50%,-50%)',
          borderRadius: 8,
          border: `1.5px dashed ${withAlpha(brand, 0.7)}`,
          pointerEvents: 'none',
        }}>
          {(['nwse-resize', 'nesw-resize', 'nesw-resize', 'nwse-resize'] as const).map((cursor, i) => (
            <span key={i} style={{
              position: 'absolute',
              left: i % 2 === 0 ? 0 : '100%',
              top: i < 2 ? 0 : '100%',
              width: 8,
              height: 8,
              background: '#fff',
              border: `1.5px solid ${brand}`,
              borderRadius: 2,
              transform: 'translate(-50%,-50%)',
              cursor,
            }} />
          ))}
        </span>
      )}
    </span>
  );
};
