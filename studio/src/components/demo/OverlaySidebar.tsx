import React, { useState } from 'react';
import { zn, brand as defaultBrand, withAlpha, FONT } from './tokens';
import {
  Bold,
  Italic,
  Underline,
  LinkIcon,
  Arrow,
  Ban,
  ChevronDown,
  Trash,
  Mic,
  SquareShape,
  RoundedShape,
  CircleShape,
} from './icons';

export type OverlayType = 'hotspot' | 'callout' | 'spotlight';

export type Overlay = {
  type: OverlayType;
  title?: string;
  body?: string;
  bgColor?: string;
  textColor?: string;
  // hotspot
  arrowPos?: 'top' | 'bottom' | 'left' | 'right';
  autoOpen?: boolean;
  invisible?: boolean;
  // callout
  arrowDir?: 'tl' | 't' | 'tr' | 'l' | 'r' | 'bl' | 'b' | 'br' | 'none';
  showArrow?: boolean;
  // spotlight
  shape?: 'square' | 'rounded' | 'circle';
  overlayOpacity?: number;
  borderColor?: string;
  borderWidth?: number;
  // shared
  destination?: 'next' | 'specific' | 'stay';
  destinationStep?: number;
  voiceover?: boolean;
};

export type OverlaySidebarProps = {
  overlay: Overlay;
  onUpdate: (patch: Partial<Overlay>) => void;
  onDelete: () => void;
  onTypeChange: (type: OverlayType) => void;
  brand?: string;
};

const SWATCHES = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b',
  '#10b981', '#06b6d4', '#3b82f6', '#ffffff', '#18181b',
];

export function OverlaySidebar({
  overlay,
  onUpdate,
  onDelete,
  onTypeChange,
  brand = defaultBrand,
}: OverlaySidebarProps) {
  return (
    <aside
      style={{
        width: 280,
        flex: '0 0 280px',
        height: '100%',
        background: zn.panel,
        borderLeft: `1px solid ${zn.border}`,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: FONT,
        color: zn.ink,
      }}
    >
      {/* Type tabs */}
      <div style={{ padding: 10, borderBottom: `1px solid ${zn.border}` }}>
        <div
          style={{
            display: 'flex',
            gap: 2,
            padding: 2,
            background: zn.bg,
            borderRadius: 8,
            border: `1px solid ${zn.border}`,
          }}
        >
          {(['hotspot', 'callout', 'spotlight'] as OverlayType[]).map((t) => {
            const active = overlay.type === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => onTypeChange(t)}
                style={{
                  flex: 1,
                  height: 26,
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  font: `600 12px/1 ${FONT}`,
                  color: active ? '#fff' : zn.mute,
                  background: active ? brand : 'transparent',
                  transition: 'background 120ms, color 120ms',
                }}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* ---- Content ---- */}
        <Section title="Content">
          <input
            value={overlay.title ?? ''}
            placeholder="Step title"
            onChange={(e) => onUpdate({ title: e.target.value })}
            style={{
              ...inputBase,
              fontSize: 14,
              fontWeight: 700,
            }}
          />

          <div style={{ marginTop: 8 }}>
            <FormatBar brand={brand} textColor={overlay.textColor} onTextColor={(c) => onUpdate({ textColor: c })} />
            <textarea
              value={overlay.body ?? ''}
              placeholder="Body text…"
              rows={3}
              onChange={(e) => onUpdate({ body: e.target.value })}
              style={{
                ...inputBase,
                fontSize: 13,
                resize: 'vertical',
                minHeight: 62,
                borderTopLeftRadius: 0,
                borderTopRightRadius: 0,
                borderTop: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            <SwatchRow
              label="Background"
              value={overlay.bgColor ?? '#18181b'}
              onChange={(c) => onUpdate({ bgColor: c })}
            />
            <SwatchRow
              label="Text"
              value={overlay.textColor ?? zn.ink}
              onChange={(c) => onUpdate({ textColor: c })}
            />
          </div>

          <LinkBtn style={{ marginTop: 8 }}>Apply style to all steps</LinkBtn>
        </Section>

        {/* ---- Type-specific ---- */}
        {overlay.type === 'hotspot' && (
          <Section title="Hotspot">
            <FieldLabel>Arrow position</FieldLabel>
            <DPad
              value={overlay.arrowPos ?? 'bottom'}
              onChange={(v) => onUpdate({ arrowPos: v })}
              brand={brand}
            />
            <div style={{ marginTop: 12 }}>
              <Toggle
                label="Open on step entry"
                checked={!!overlay.autoOpen}
                onChange={(v) => onUpdate({ autoOpen: v })}
                brand={brand}
              />
              <Toggle
                label="Hide indicator"
                checked={!!overlay.invisible}
                onChange={(v) => onUpdate({ invisible: v })}
                brand={brand}
              />
            </div>
          </Section>
        )}

        {overlay.type === 'callout' && (
          <Section title="Callout">
            <FieldLabel>Arrow direction</FieldLabel>
            <DirGrid
              value={overlay.arrowDir ?? 'none'}
              onChange={(v) => onUpdate({ arrowDir: v })}
              brand={brand}
            />
            <div style={{ marginTop: 12 }}>
              <Toggle
                label="Show pulsing arrow"
                checked={overlay.showArrow ?? true}
                onChange={(v) => onUpdate({ showArrow: v })}
                brand={brand}
              />
            </div>
          </Section>
        )}

        {overlay.type === 'spotlight' && (
          <Section title="Spotlight">
            <FieldLabel>Shape</FieldLabel>
            <SegGroup
              options={[
                { id: 'square', label: 'Square', Icon: SquareShape },
                { id: 'rounded', label: 'Rounded', Icon: RoundedShape },
                { id: 'circle', label: 'Circle', Icon: CircleShape },
              ]}
              value={overlay.shape ?? 'rounded'}
              onChange={(v) => onUpdate({ shape: v as Overlay['shape'] })}
              brand={brand}
            />

            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <FieldLabel style={{ margin: 0 }}>Overlay opacity</FieldLabel>
                <span style={{ fontSize: 12, color: zn.mute, fontVariantNumeric: 'tabular-nums' }}>
                  {overlay.overlayOpacity ?? 55}%
                </span>
              </div>
              <Slider
                value={overlay.overlayOpacity ?? 55}
                onChange={(v) => onUpdate({ overlayOpacity: v })}
                brand={brand}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 14 }}>
              <div style={{ flex: 1 }}>
                <FieldLabel>Border color</FieldLabel>
                <SwatchRow
                  compact
                  value={overlay.borderColor ?? brand}
                  onChange={(c) => onUpdate({ borderColor: c })}
                />
              </div>
              <div style={{ width: 78 }}>
                <FieldLabel>Width</FieldLabel>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    min={0}
                    max={12}
                    value={overlay.borderWidth ?? 2}
                    onChange={(e) => onUpdate({ borderWidth: Number(e.target.value) })}
                    style={{ ...inputBase, height: 30, fontSize: 13, paddingRight: 26 }}
                  />
                  <span style={spanUnit}>px</span>
                </div>
              </div>
            </div>
          </Section>
        )}

        {/* ---- Destination ---- */}
        <Section title="On click →">
          <Select
            value={overlay.destination ?? 'next'}
            onChange={(v) => onUpdate({ destination: v as Overlay['destination'] })}
            options={[
              { value: 'next', label: 'Go to next step' },
              { value: 'specific', label: 'Go to specific step…' },
              { value: 'stay', label: 'Stay on this step' },
            ]}
          />
          {overlay.destination === 'specific' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: 12, color: zn.mute }}>Step</span>
              <input
                type="number"
                min={1}
                value={overlay.destinationStep ?? 1}
                onChange={(e) => onUpdate({ destinationStep: Number(e.target.value) })}
                style={{ ...inputBase, width: 64, height: 30, fontSize: 13 }}
              />
            </div>
          )}
        </Section>
      </div>

      {/* Footer */}
      <div style={{ padding: 12, borderTop: `1px solid ${zn.border}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Toggle
          label="Voiceover from text"
          checked={!!overlay.voiceover}
          onChange={(v) => onUpdate({ voiceover: v })}
          brand={brand}
          icon={<Mic size={14} color={zn.mute} />}
        />
        <button
          type="button"
          onClick={onDelete}
          style={{
            height: 34,
            borderRadius: 8,
            background: 'transparent',
            border: `1px solid ${withAlpha('#ef4444', 0.5)}`,
            color: '#f87171',
            font: `600 12.5px/1 ${FONT}`,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            transition: 'background 120ms',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = withAlpha('#ef4444', 0.12))}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <Trash size={14} color="currentColor" />
          Delete overlay
        </button>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
/* ------------------------------------------------------------------ */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          color: zn.dim,
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

function FieldLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ fontSize: 12, color: zn.mute, marginBottom: 7, ...style }}>{children}</div>
  );
}

function LinkBtn({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <button
      type="button"
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        color: zn.dim,
        fontSize: 11.5,
        cursor: 'pointer',
        textDecoration: 'underline',
        textUnderlineOffset: 2,
        font: `400 11.5px/1 ${FONT}`,
        ...style,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = zn.mute)}
      onMouseLeave={(e) => (e.currentTarget.style.color = zn.dim)}
    >
      {children}
    </button>
  );
}

function FormatBar({
  brand,
  textColor,
  onTextColor,
}: {
  brand: string;
  textColor?: string;
  onTextColor: (c: string) => void;
}) {
  const btn = (Icon: React.ComponentType<any>, key: string) => (
    <button key={key} type="button" style={fmtBtn}
      onMouseEnter={(e) => (e.currentTarget.style.background = zn.chip)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <Icon size={14} color={zn.mute} />
    </button>
  );
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        height: 30,
        padding: '0 4px',
        background: zn.panel2,
        border: `1px solid ${zn.border}`,
        borderBottom: `1px solid ${zn.border2}`,
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
      }}
    >
      {btn(Bold, 'b')}
      {btn(Italic, 'i')}
      {btn(Underline, 'u')}
      <div style={{ width: 1, height: 16, background: zn.border2, margin: '0 3px' }} />
      {btn(LinkIcon, 'link')}
      <div style={{ flex: 1 }} />
      <SwatchButton value={textColor ?? '#e4e4e7'} onChange={onTextColor} size={16} />
    </div>
  );
}

function SwatchRow({
  label,
  value,
  onChange,
  compact,
}: {
  label?: string;
  value: string;
  onChange: (c: string) => void;
  compact?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: compact ? 30 : 24 }}>
      {label && <span style={{ fontSize: 12.5, color: zn.ink }}>{label}</span>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: zn.dim, fontVariantNumeric: 'tabular-nums' }}>
          {value.toUpperCase()}
        </span>
        <SwatchButton value={value} onChange={onChange} size={compact ? 28 : 20} square={compact} />
      </div>
    </div>
  );
}

function SwatchButton({
  value,
  onChange,
  size = 20,
  square,
}: {
  value: string;
  onChange: (c: string) => void;
  size?: number;
  square?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: size,
          height: size,
          borderRadius: square ? 7 : '50%',
          background: value,
          border: `1px solid ${value.toLowerCase() === '#ffffff' ? zn.border2 : 'rgba(255,255,255,0.18)'}`,
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.25)',
          cursor: 'pointer',
          padding: 0,
        }}
      />
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: 'absolute',
              top: size + 6,
              right: 0,
              zIndex: 41,
              padding: 8,
              borderRadius: 10,
              background: zn.panel2,
              border: `1px solid ${zn.border2}`,
              boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 6,
              width: 150,
            }}
          >
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: c,
                  border: value.toLowerCase() === c.toLowerCase()
                    ? `2px solid ${zn.ink}`
                    : `1px solid rgba(255,255,255,0.14)`,
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  brand,
  icon,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  brand: string;
  icon?: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 30,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {icon}
      <span style={{ fontSize: 12.5, color: zn.ink, flex: 1 }}>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          width: 34,
          height: 20,
          borderRadius: 999,
          border: 'none',
          cursor: 'pointer',
          padding: 2,
          background: checked ? brand : zn.chip,
          transition: 'background 140ms',
          display: 'flex',
          justifyContent: checked ? 'flex-end' : 'flex-start',
        }}
      >
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
            transition: 'transform 140ms',
          }}
        />
      </button>
    </label>
  );
}

function DPad({
  value,
  onChange,
  brand,
}: {
  value: 'top' | 'bottom' | 'left' | 'right';
  onChange: (v: 'top' | 'bottom' | 'left' | 'right') => void;
  brand: string;
}) {
  const cell = (dir: 'top' | 'bottom' | 'left' | 'right', rotate: number, gridArea: string) => {
    const active = value === dir;
    return (
      <button
        type="button"
        onClick={() => onChange(dir)}
        style={{
          gridArea,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 34,
          borderRadius: 7,
          cursor: 'pointer',
          background: active ? withAlpha(brand, 0.16) : zn.bg,
          border: `1px solid ${active ? withAlpha(brand, 0.6) : zn.border}`,
        }}
      >
        <Arrow size={15} rotate={rotate} color={active ? brand : zn.mute} />
      </button>
    );
  };
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(3, 1fr)',
        gridTemplateAreas: `". t ." "l c r" ". b ."`,
        gap: 6,
        width: 132,
      }}
    >
      {cell('top', 0, 't')}
      {cell('left', -90, 'l')}
      <div style={{ gridArea: 'c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: zn.border2 }} />
      </div>
      {cell('right', 90, 'r')}
      {cell('bottom', 180, 'b')}
    </div>
  );
}

const DIR_CELLS: { id: Overlay['arrowDir']; rotate: number }[] = [
  { id: 'tl', rotate: -45 }, { id: 't', rotate: 0 }, { id: 'tr', rotate: 45 },
  { id: 'l', rotate: -90 }, { id: 'none', rotate: 0 }, { id: 'r', rotate: 90 },
  { id: 'bl', rotate: -135 }, { id: 'b', rotate: 180 }, { id: 'br', rotate: 135 },
];

function DirGrid({
  value,
  onChange,
  brand,
}: {
  value: Overlay['arrowDir'];
  onChange: (v: NonNullable<Overlay['arrowDir']>) => void;
  brand: string;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, width: 132 }}>
      {DIR_CELLS.map((cell) => {
        const active = value === cell.id;
        const isNone = cell.id === 'none';
        return (
          <button
            key={cell.id}
            type="button"
            onClick={() => onChange(cell.id as NonNullable<Overlay['arrowDir']>)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 34,
              borderRadius: 7,
              cursor: 'pointer',
              background: active ? withAlpha(brand, 0.16) : zn.bg,
              border: `1px solid ${active ? withAlpha(brand, 0.6) : zn.border}`,
            }}
          >
            {isNone ? (
              <Ban size={14} color={active ? brand : zn.dim} />
            ) : (
              <Arrow size={15} rotate={cell.rotate} color={active ? brand : zn.mute} />
            )}
          </button>
        );
      })}
    </div>
  );
}

function SegGroup({
  options,
  value,
  onChange,
  brand,
}: {
  options: { id: string; label: string; Icon: React.ComponentType<any> }[];
  value: string;
  onChange: (v: string) => void;
  brand: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {options.map(({ id, label, Icon }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 5,
              padding: '8px 0',
              borderRadius: 8,
              cursor: 'pointer',
              background: active ? withAlpha(brand, 0.14) : zn.bg,
              border: `1px solid ${active ? withAlpha(brand, 0.55) : zn.border}`,
              color: active ? brand : zn.mute,
              font: `500 11px/1 ${FONT}`,
            }}
          >
            <Icon size={18} color="currentColor" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Slider({
  value,
  onChange,
  brand,
}: {
  value: number;
  onChange: (v: number) => void;
  brand: string;
}) {
  return (
    <input
      type="range"
      min={0}
      max={100}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        width: '100%',
        marginTop: 8,
        accentColor: brand,
        height: 4,
        cursor: 'pointer',
      }}
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...inputBase,
          height: 34,
          fontSize: 13,
          appearance: 'none',
          WebkitAppearance: 'none',
          paddingRight: 30,
          cursor: 'pointer',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ background: zn.panel2 }}>
            {o.label}
          </option>
        ))}
      </select>
      <span style={{ position: 'absolute', right: 9, top: 9, pointerEvents: 'none' }}>
        <ChevronDown size={16} color={zn.dim} />
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared styles                                                       */
/* ------------------------------------------------------------------ */

const inputBase: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: zn.bg,
  border: `1px solid ${zn.border}`,
  borderRadius: 8,
  padding: '8px 10px',
  color: zn.ink,
  font: `400 13px/1.45 ${FONT}`,
  outline: 'none',
};

const fmtBtn: React.CSSProperties = {
  width: 26,
  height: 22,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 5,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  padding: 0,
};

const spanUnit: React.CSSProperties = {
  position: 'absolute',
  right: 9,
  top: 8,
  fontSize: 12,
  color: zn.dim,
  pointerEvents: 'none',
};

export default OverlaySidebar;
