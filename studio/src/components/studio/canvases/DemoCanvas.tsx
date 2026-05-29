import React, { useState, useEffect } from 'react';
import { useStudioStore } from '../../../store/useStudioStore';
import { I } from '../../../components/icons';
import { ScreenshotPlaceholder } from '../../../components/ui';
import { Hotspot } from '../../../components/demo/Hotspot';
import type { HotspotStyle } from '../../../components/demo/Hotspot';
import { HotspotStylePicker } from '../../../components/demo/HotspotStylePicker';
import { CardTypePicker } from '../../../components/demo/CardTypePicker';
import type { DemoCardType } from '../../../components/demo/CardTypePicker';
import { withAlpha } from '../../../components/demo/helpers';
import { displayText } from '../../../lib/textUtils';

// ─── Design tokens ────────────────────────────────────────────────────────────

const zn = {
  bg: '#09090b', panel: '#161618', panel2: '#1c1c1f',
  border: '#27272a', border2: '#323237',
  ink: '#e4e4e7', mute: '#a1a1aa', dim: '#71717a', chip: '#252528',
};

// ─── Top bar ──────────────────────────────────────────────────────────────────

function TopBtn({ children, icon, primary, ghost, brand, onClick }: {
  children?: React.ReactNode; icon?: React.ReactNode; primary?: boolean;
  ghost?: boolean; brand?: string; onClick?: () => void;
}) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ height: 30, padding: '0 12px', borderRadius: 7, fontSize: 12.5, fontWeight: 550, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, border: primary ? 'none' : `1px solid ${h ? zn.border2 : zn.border}`, background: primary ? brand : ghost ? (h ? zn.chip : 'transparent') : (h ? zn.panel2 : zn.panel), color: primary ? '#fff' : zn.ink, boxShadow: primary && brand ? `0 4px 14px ${withAlpha(brand, 0.35)}` : 'none', transition: 'all 0.13s' }}>
      {icon}{children}
    </button>
  );
}

function TopBar({ brand, autoplay, setAutoplay }: { brand: string; autoplay: boolean; setAutoplay: (v: boolean) => void }) {
  const session = useStudioStore((s) => s.session);
  const title = session?.aiOutputs?.title || 'Untitled demo';
  return (
    <div style={{ height: 52, flex: 'none', borderBottom: `1px solid ${zn.border}`, background: zn.bg, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ width: 24, height: 24, borderRadius: 7, background: brand, display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 13 }}>S</span>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: zn.ink }}>{title}</span>
          <span style={{ fontSize: 10.5, color: zn.dim }}>Demo mode</span>
        </div>
        <I.ChevronDown size={14} style={{ color: zn.dim, marginLeft: 2 }} />
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 9 }}>
        <TopBtn icon={<I.Palette size={15} />} ghost>Branding</TopBtn>
        <div onClick={() => setAutoplay(!autoplay)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '0 4px' }}>
          <span style={{ fontSize: 12.5, color: zn.mute, fontWeight: 500 }}>Autoplay</span>
          <span style={{ width: 34, height: 19, borderRadius: 99, background: autoplay ? brand : zn.border2, position: 'relative', transition: 'background 0.18s' }}>
            <span style={{ position: 'absolute', top: 2, left: autoplay ? 17 : 2, width: 15, height: 15, borderRadius: '50%', background: '#fff', transition: 'left 0.18s', boxShadow: '0 1px 2px rgba(0,0,0,0.4)' }} />
          </span>
        </div>
        <span style={{ width: 1, height: 22, background: zn.border }} />
        <TopBtn icon={<I.Share2 size={15} />}>Share</TopBtn>
        <TopBtn icon={<I.Eye size={15} />} primary brand={brand}>Preview</TopBtn>
      </div>
    </div>
  );
}

// ─── Step rail ────────────────────────────────────────────────────────────────

function StepRail({ current, setCurrent, brand, session }: {
  current: number; setCurrent: (i: number) => void; brand: string; session: any;
}) {
  const steps = session?.steps ?? [];
  const chapterBreaks = new Set((session?.metadata?.chapterBreaks ?? []).map((b: any) => b.afterStepId));
  return (
    <div className="dm-scroll" style={{ width: 136, flex: 'none', borderRight: `1px solid ${zn.border}`, background: zn.bg, padding: '10px 9px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: zn.dim, padding: '2px 4px 4px' }}>Steps</div>
      {steps.map((step: any, i: number) => {
        const active = i === current;
        const isChapterStart = i > 0 && chapterBreaks.has(steps[i - 1]?.id);
        return (
          <div key={step.id}>
            {isChapterStart && <div style={{ height: 1, background: zn.border, margin: '2px 0 6px' }} />}
            <div onClick={() => setCurrent(i)} style={{ borderRadius: 8, padding: 5, cursor: 'pointer', background: active ? withAlpha(brand, 0.12) : 'transparent', border: `1px solid ${active ? withAlpha(brand, 0.4) : 'transparent'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: active ? brand : zn.dim, width: 14 }}>{String(i + 1).padStart(2, '0')}</span>
              </div>
              <div style={{ aspectRatio: '16/10', borderRadius: 5, overflow: 'hidden', position: 'relative', border: `1px solid ${zn.border}`, background: '#fff' }}>
                <ScreenshotPlaceholder step={step} session={session} showChrome={false} aspect="16/10" rounded="" mode="blueprint" className="w-full h-full" />
                <span style={{ position: 'absolute', right: 3, top: 3, width: 7, height: 7, borderRadius: '50%', background: brand, border: '1.5px solid #fff' }} />
              </div>
              <div style={{ fontSize: 10.5, color: active ? zn.ink : zn.mute, fontWeight: active ? 600 : 450, marginTop: 4, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {step.stepTitle || displayText(step.textOverride || step.generatedText) || `Step ${i + 1}`}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Browser mock (screenshot + hotspot) ─────────────────────────────────────

function BrowserMock({ step, session, brand, hotspotStyle }: { step: any; session: any; brand: string; hotspotStyle: HotspotStyle }) {
  const coords = step?.coordinates;
  const hotspotX = coords && coords.viewportWidth > 0 ? (coords.x / coords.viewportWidth) * 100 : 50;
  const hotspotY = coords && coords.viewportHeight > 0 ? (coords.y / coords.viewportHeight) * 100 : 50;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: zn.bg, position: 'relative' }}>
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '34px 40px', minHeight: 0 }}>
        <div style={{ width: '100%', maxWidth: 760, borderRadius: 12, overflow: 'hidden', boxShadow: '0 30px 70px -24px rgba(0,0,0,0.8)', border: `1px solid ${zn.border2}` }}>
          {/* Browser chrome */}
          <div style={{ height: 34, background: '#1f1f22', display: 'flex', alignItems: 'center', gap: 7, padding: '0 12px', borderBottom: `1px solid ${zn.border}` }}>
            <span style={{ display: 'flex', gap: 6 }}>
              {['#ff5f57', '#febc2e', '#28c840'].map((c) => <span key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c }} />)}
            </span>
            <div style={{ marginLeft: 10, flex: 1, maxWidth: 320, height: 20, borderRadius: 6, background: '#161618', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11, color: zn.dim }}>
              <I.Link size={11} /> {step?.url?.replace(/^https?:\/\//, '').substring(0, 40) || 'app.example.com'}
            </div>
          </div>
          {/* Screenshot + overlays */}
          <div style={{ position: 'relative', aspectRatio: '16/9', background: '#fff' }}>
            {/* Progress bar */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'rgba(0,0,0,0.1)', zIndex: 30 }}>
              <div style={{ height: '100%', background: brand }} />
            </div>
            <ScreenshotPlaceholder step={step} session={session} showChrome={false} aspect="16/9" rounded="" mode="stage" className="w-full h-full !shadow-none" />
            {coords && (
              <Hotspot style={hotspotStyle} brand={brand} white={hotspotStyle !== 'arrow' && hotspotStyle !== 'ring'} x={hotspotX} y={hotspotY} size={20} handles />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Card block ───────────────────────────────────────────────────────────────

const fieldLabel: React.CSSProperties = { fontSize: 10.5, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: zn.dim, marginBottom: 6, display: 'block' };
const inputStyle: React.CSSProperties = { width: '100%', background: zn.bg, border: `1px solid ${zn.border}`, borderRadius: 8, color: zn.ink, fontSize: 13, padding: '9px 11px', outline: 'none', fontFamily: 'inherit' };

function CardBlock({ type, children, brand, defaultOpen = true }: { type: string; children: React.ReactNode; brand: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const iconMap: Record<string, React.FC<any>> = { text: I.AlignLeft, cta: I.ArrowRight, blur: I.EyeOff, callout: I.MessageSquare, video: I.Video, form: I.ClipboardList, image: I.Image, embed: I.Code2 };
  const Icon = iconMap[type] || I.AlignLeft;
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  return (
    <div style={{ borderRadius: 10, border: `1px solid ${zn.border}`, background: zn.panel, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 9px', background: zn.panel2, borderBottom: open ? `1px solid ${zn.border}` : 'none' }}>
        <span style={{ color: zn.dim, cursor: 'grab', display: 'flex' }}><I.GripVertical size={15} /></span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: brand, background: withAlpha(brand, 0.13), padding: '3px 8px', borderRadius: 6 }}>
          <Icon size={12} /> {label}
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <button onClick={() => setOpen((v) => !v)} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'transparent', color: zn.dim, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            {open ? <I.ChevronUp size={15} /> : <I.ChevronDown size={15} />}
          </button>
        </span>
      </div>
      {open && <div style={{ padding: 11 }}>{children}</div>}
    </div>
  );
}

// ─── Content panel ────────────────────────────────────────────────────────────

function ContentPanel({ step, stepIndex, brand, onSave }: { step: any; stepIndex: number; brand: string; onSave: (updates: any) => void }) {
  const [picker, setPicker] = useState(false);
  const [title, setTitle] = useState(step?.stepTitle || '');
  const [body,  setBody]  = useState(displayText(step?.textOverride || step?.generatedText) || '');

  useEffect(() => {
    setTitle(step?.stepTitle || '');
    setBody(displayText(step?.textOverride || step?.generatedText) || '');
  }, [step?.id]);

  const save = () => onSave({ stepTitle: title || null, textOverride: body || null });

  return (
    <div className="dm-scroll" style={{ width: 340, flex: 'none', borderLeft: `1px solid ${zn.border}`, background: zn.bg, padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 11, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: zn.ink }}>Step content</span>
        <span style={{ fontSize: 11, color: zn.dim }}>Step {stepIndex + 1}</span>
      </div>

      {/* Title */}
      <div>
        <label style={fieldLabel}>Step title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={save} placeholder="e.g. Select a project" style={{ ...inputStyle, fontWeight: 600, fontSize: 14 }} />
      </div>

      {/* Text card */}
      <CardBlock type="text" brand={brand}>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} onBlur={save} rows={3} placeholder="Describe what's happening…" style={{ ...inputStyle, lineHeight: 1.5 }} />
      </CardBlock>

      {/* Add card button */}
      <button onClick={() => setPicker((v) => !v)} style={{ height: 38, borderRadius: 9, border: `1.5px dashed ${zn.border2}`, background: 'transparent', color: zn.mute, fontSize: 12.5, fontWeight: 550, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
        <I.Plus size={15} /> Add card
      </button>

      {picker && (
        <div style={{ position: 'absolute', left: 14, right: 14, bottom: 14, zIndex: 50 }}>
          <CardTypePicker brand={brand} onPick={(t: DemoCardType) => { setPicker(false); }} onClose={() => setPicker(false)} embedded />
        </div>
      )}
    </div>
  );
}

// ─── Bottom bar ───────────────────────────────────────────────────────────────

function BottomBar({ current, total, brand, onPrev, onNext }: { current: number; total: number; brand: string; onPrev: () => void; onNext: () => void }) {
  return (
    <div style={{ height: 46, flex: 'none', borderTop: `1px solid ${zn.border}`, background: zn.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '0 16px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={onPrev} style={{ width: 30, height: 28, borderRadius: 7, border: `1px solid ${zn.border}`, background: 'transparent', display: 'grid', placeItems: 'center', color: zn.mute, cursor: 'pointer' }}>
          <I.ChevronLeft size={16} />
        </button>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: zn.ink, fontVariantNumeric: 'tabular-nums', minWidth: 52, textAlign: 'center' }}>{current + 1} / {total}</span>
        <button onClick={onNext} style={{ width: 30, height: 28, borderRadius: 7, border: 'none', background: brand, display: 'grid', placeItems: 'center', color: '#fff', cursor: 'pointer' }}>
          <I.ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ─── Main: DemoCanvas (Studio Editor) ────────────────────────────────────────

export const DemoCanvas: React.FC = () => {
  const session    = useStudioStore((s) => s.session);
  const brandState = useStudioStore((s) => s.brand);
  const saveStep   = useStudioStore((s) => s.saveStep);
  const updateStep = useStudioStore((s) => s.updateStep);
  const brand      = brandState.primaryColor || '#6366f1';

  const [current,      setCurrent]      = useState(0);
  const [hotspotStyle, setHotspotStyle] = useState<HotspotStyle>('pulse');
  const [autoplay,     setAutoplay]     = useState(false);
  const [showHsPicker, setShowHsPicker] = useState(false);

  const steps = session?.steps ?? [];
  const step  = steps[current];
  const total = steps.length;

  // Auto-advance when autoplay is on
  useEffect(() => {
    if (!autoplay || total === 0) return;
    const t = setInterval(() => setCurrent((c) => (c + 1) % total), 5000);
    return () => clearInterval(t);
  }, [autoplay, total]);

  if (!session || !step) return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', background: zn.bg, color: zn.dim, fontSize: 13 }}>
      No steps yet
    </div>
  );

  const handleSave = async (updates: { stepTitle?: string | null; textOverride?: string | null }) => {
    updateStep(step.id, updates as any);
    await saveStep(step.id, { textOverride: updates.textOverride ?? undefined });
  };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: zn.bg, color: zn.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <TopBar brand={brand} autoplay={autoplay} setAutoplay={setAutoplay} />
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        <StepRail current={current} setCurrent={setCurrent} brand={brand} session={session} />
        <BrowserMock step={step} session={session} brand={brand} hotspotStyle={hotspotStyle} />
        <ContentPanel step={step} stepIndex={current} brand={brand} onSave={handleSave} />

        {/* Hotspot style picker overlay */}
        {showHsPicker && (
          <div style={{ position: 'absolute', bottom: 60, right: 360, zIndex: 60 }}>
            <HotspotStylePicker brand={brand} selected={hotspotStyle} onPick={(s) => { setHotspotStyle(s); setShowHsPicker(false); }} onClose={() => setShowHsPicker(false)} />
          </div>
        )}
      </div>
      <BottomBar current={current} total={total} brand={brand} onPrev={() => setCurrent((c) => Math.max(0, c - 1))} onNext={() => setCurrent((c) => Math.min(total - 1, c + 1))} />
    </div>
  );
};
