import React, { useState } from 'react';
import { withAlpha } from './helpers';
import { I } from '../icons';

export type DemoCardType = 'text' | 'cta' | 'blur' | 'callout' | 'video' | 'form' | 'image' | 'embed';

const CARD_TYPES: { id: DemoCardType; label: string; desc: string; Icon: React.FC<any>; soon?: boolean }[] = [
  { id: 'text',    label: 'Text',    desc: 'Rich paragraph',  Icon: I.AlignLeft },
  { id: 'cta',     label: 'CTA',     desc: 'Button + link',   Icon: I.ArrowRight },
  { id: 'blur',    label: 'Blur',    desc: 'Mask a region',   Icon: I.EyeOff },
  { id: 'callout', label: 'Callout', desc: 'Pin a note',      Icon: I.MessageSquare },
  { id: 'video',   label: 'Video',   desc: 'Embed clip',      Icon: I.Video },
  { id: 'form',    label: 'Form',    desc: 'Capture leads',   Icon: I.ClipboardList,  soon: true },
  { id: 'image',   label: 'Image',   desc: 'Static figure',   Icon: I.Image,          soon: true },
  { id: 'embed',   label: 'Embed',   desc: 'Iframe / HTML',   Icon: I.Code2,          soon: true },
];

const pk = {
  panel: '#161618', panel2: '#1c1c1f', border: '#2a2a2e',
  ink: '#e4e4e7', dim: '#71717a', bg: '#0d0d0f',
};

interface Props {
  brand?: string;
  onPick?: (type: DemoCardType) => void;
  onClose?: () => void;
  embedded?: boolean;
}

export const CardTypePicker: React.FC<Props> = ({
  brand = '#6366f1',
  onPick,
  onClose,
  embedded = false,
}) => {
  const [hover, setHover] = useState<DemoCardType | null>(null);

  return (
    <div style={{
      width: embedded ? '100%' : 320,
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
          <div style={{ fontSize: 13.5, fontWeight: 700, color: pk.ink }}>Add a card</div>
          <div style={{ fontSize: 11.5, color: pk.dim, marginTop: 1 }}>Pick a block to insert into this step</div>
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
      <div style={{ padding: 11, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {CARD_TYPES.map((c) => {
          const h = hover === c.id && !c.soon;
          return (
            <button
              key={c.id}
              onMouseEnter={() => !c.soon && setHover(c.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => !c.soon && onPick?.(c.id)}
              disabled={c.soon}
              style={{
                textAlign: 'left',
                padding: '11px 11px',
                borderRadius: 10,
                cursor: c.soon ? 'default' : 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 7,
                border: `1px solid ${h ? withAlpha(brand, 0.5) : pk.border}`,
                background: h ? withAlpha(brand, 0.1) : pk.panel2,
                transition: 'all 0.12s',
                opacity: c.soon ? 0.45 : 1,
                position: 'relative',
              }}
            >
              {c.soon && (
                <span style={{ position: 'absolute', top: 6, right: 7, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: pk.dim, background: pk.bg, padding: '1px 5px', borderRadius: 4, border: `1px solid ${pk.border}` }}>Soon</span>
              )}
              <span style={{
                width: 30, height: 30, borderRadius: 8,
                display: 'grid', placeItems: 'center',
                background: h ? brand : pk.bg,
                color: h ? '#fff' : brand,
                transition: 'all 0.12s',
                flex: 'none',
              }}>
                <c.Icon size={16} />
              </span>
              <span>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: pk.ink }}>{c.label}</div>
                <div style={{ fontSize: 10.5, color: pk.dim, marginTop: 1 }}>{c.desc}</div>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
