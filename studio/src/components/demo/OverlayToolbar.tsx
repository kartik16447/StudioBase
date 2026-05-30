import React from 'react';
import { zn, brand as defaultBrand, withAlpha, FONT } from './tokens';
import { Crosshair, MessageSquare, Scan, ZoomIn, Paintbrush, Eye } from './icons';

export type OverlayTool = 'hotspot' | 'callout' | 'spotlight' | 'zoomFocus';

export type OverlayToolbarProps = {
  activeTool: OverlayTool | null;
  onSelectTool: (tool: OverlayTool) => void;
  onEditScreenshot: () => void;
  onPreview?: () => void;
  /** Tenant accent. Defaults to the placeholder indigo. */
  brand?: string;
};

const TOOLS: { id: OverlayTool; label: string; Icon: React.ComponentType<any> }[] = [
  { id: 'hotspot', label: 'Hotspot', Icon: Crosshair },
  { id: 'callout', label: 'Callout', Icon: MessageSquare },
  { id: 'spotlight', label: 'Spotlight', Icon: Scan },
  { id: 'zoomFocus', label: 'Focus', Icon: ZoomIn },
];

const HINTS: Record<OverlayTool, string> = {
  hotspot: 'Click on the screenshot to place a hotspot',
  callout: 'Click on the screenshot to place a callout',
  spotlight: 'Click and drag on the screenshot to draw a spotlight',
  zoomFocus: 'Drag a rectangle on the screenshot to set zoom focus',
};

export function OverlayToolbar({
  activeTool,
  onSelectTool,
  onEditScreenshot,
  onPreview,
  brand = defaultBrand,
}: OverlayToolbarProps) {
  return (
    <div style={{ position: 'relative', fontFamily: FONT }}>
      <div
        style={{
          height: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 10px',
          background: zn.panel2,
          borderBottom: `1px solid ${zn.border}`,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.3,
            textTransform: 'uppercase',
            color: zn.dim,
            marginRight: 6,
          }}
        >
          Add
        </span>

        {TOOLS.map(({ id, label, Icon }) => {
          const active = activeTool === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTool(id)}
              style={{
                ...toolBtn,
                color: active ? brand : zn.ink,
                background: active ? withAlpha(brand, 0.14) : 'transparent',
                border: `1px solid ${active ? withAlpha(brand, 0.55) : 'transparent'}`,
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = zn.chip;
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = 'transparent';
              }}
            >
              <Icon size={15} color={active ? brand : zn.mute} />
              <span>{label}</span>
            </button>
          );
        })}

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={onEditScreenshot}
          style={{ ...toolBtn, color: zn.mute }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = zn.chip;
            e.currentTarget.style.color = zn.ink;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = zn.mute;
          }}
        >
          <Paintbrush size={15} color="currentColor" />
          <span>Edit screenshot</span>
        </button>

        <div style={{ width: 1, height: 18, background: zn.border2, margin: '0 4px' }} />

        <button
          type="button"
          onClick={onPreview}
          style={{
            ...toolBtn,
            color: '#fff',
            background: brand,
            border: `1px solid ${brand}`,
            fontWeight: 600,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.08)')}
          onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
        >
          <Eye size={15} color="#fff" />
          <span>Preview</span>
        </button>
      </div>

      {activeTool && (
        <div
          style={{
            position: 'absolute',
            top: 44,
            left: 12,
            zIndex: 20,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            height: 26,
            padding: '0 10px',
            borderRadius: 7,
            background: withAlpha(brand, 0.14),
            border: `1px solid ${withAlpha(brand, 0.4)}`,
            color: brand,
            fontSize: 12,
            fontWeight: 500,
            boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: brand,
              boxShadow: `0 0 0 4px ${withAlpha(brand, 0.25)}`,
            }}
          />
          {HINTS[activeTool]}
        </div>
      )}
    </div>
  );
}

const toolBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  height: 28,
  padding: '0 10px',
  borderRadius: 7,
  border: '1px solid transparent',
  background: 'transparent',
  font: `500 12.5px/1 ${FONT}`,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'background 120ms, color 120ms, filter 120ms',
};

export default OverlayToolbar;
