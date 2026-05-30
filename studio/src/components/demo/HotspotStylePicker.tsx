import React, { useState, useEffect } from 'react';
import { withAlpha } from './helpers';
import { Hotspot } from './Hotspot';
import type { HotspotStyle } from './Hotspot';
import { I } from '../icons';

const HOTSPOT_STYLES: { id: HotspotStyle; label: string; desc: string }[] = [
  { id: 'pulse',  label: 'Pulse',  desc: 'Beating dot + ring' },
  { id: 'filled', label: 'Filled', desc: 'Solid dot' },
  { id: 'ring',   label: 'Ring',   desc: 'Hollow outline' },
  { id: 'arrow',  label: 'Arrow',  desc: 'Bobbing pointer' },
];

const pk = {
  panel: '#161618', panel2: '#1c1c1f', border: '#2a2a2e',
  ink: '#e4e4e7', dim: '#71717a',
};

function MiniPreview({ styleId, brand }: { styleId: HotspotStyle; brand: string }) {
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      aspectRatio: '16/10',
      borderRadius: 8,
      overflow: 'hidden',
      background: '#fff',
      border: `1px solid ${pk.border}`,
    }}>
      {/* faux UI skeleton */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
        <div style={{ width: '26%', background: '#f4f4f5', borderRight: '1px solid #ececef' }} />
        <div style={{ flex: 1, padding: 7 }}>
          <div style={{ height: 6, width: '55%', background: '#e4e4e7', borderRadius: 3 }} />
          <div style={{ height: 22, marginTop: 7, background: '#f1f1f3', borderRadius: 4 }} />
        </div>
      </div>
      <Hotspot style={styleId} brand={brand} white={styleId !== 'arrow' && styleId !== 'ring'} x={58} y={56} size={15} />
    </div>
  );
}

interface Props {
  brand?: string;
  selected?: HotspotStyle;
  onPick?: (style: HotspotStyle) => void;
  onClose?: () => void;
  embedded?: boolean;
}

export const HotspotStylePicker: React.FC<Props> = ({
  brand = '#6366f1',
  selected = 'pulse',
  onPick,
  onClose,
  embedded = false,
}) => {
  const [sel, setSel] = useState<HotspotStyle>(selected);
  useEffect(() => setSel(selected), [selected]);

  useEffect(() => {
    if (!onClose) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const pick = (id: HotspotStyle) => {
    setSel(id);
    onPick?.(id);
  };

  return (
    <div style={{
      width: embedded ? '100%' : 300,
      background: pk.panel,
      border: `1px solid ${pk.border}`,
      borderRadius: 14,
      boxShadow: '0 28px 70px -16px rgba(0,0,0,0.75)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '13px 15px 11px',
        borderBottom: `1px solid ${pk.border}`,
        display: 'flex',
        alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: pk.ink }}>Hotspot style</div>
          <div style={{ fontSize: 11.5, color: pk.dim, marginTop: 1 }}>How the click target appears to viewers</div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{ marginLeft: 'auto', width: 26, height: 26, borderRadius: 7, border: 'none', background: pk.panel2, color: pk.dim, cursor: 'pointer', display: 'grid', placeItems: 'center' }}
          >
            <I.X size={14} />
          </button>
        )}
      </div>
      <div style={{ padding: 11, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
        {HOTSPOT_STYLES.map((s) => {
          const active = sel === s.id;
          return (
            <button
              key={s.id}
              onClick={() => pick(s.id)}
              style={{
                padding: 8,
                borderRadius: 11,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: 7,
                border: `1.5px solid ${active ? brand : pk.border}`,
                background: active ? withAlpha(brand, 0.1) : pk.panel2,
                boxShadow: active ? `0 0 0 3px ${withAlpha(brand, 0.14)}` : 'none',
                transition: 'all 0.12s',
              }}
            >
              <MiniPreview styleId={s.id} brand={brand} />
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: pk.ink }}>{s.label}</span>
                {active && (
                  <span style={{ marginLeft: 'auto', color: brand, display: 'flex' }}>
                    <I.Check size={15} />
                  </span>
                )}
              </span>
              <span style={{ fontSize: 10.5, color: pk.dim, marginTop: -3 }}>{s.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
