import React, { useState, useEffect, useCallback } from 'react';
import { useStudioStore } from '../../../store/useStudioStore';
import { I } from '../../icons';
import { ScreenshotPlaceholder } from '../../ui';
import { Hotspot } from '../../demo/Hotspot';
import type { HotspotStyle } from '../../demo/Hotspot';
import { withAlpha, brandGradient } from '../../demo/helpers';
import { displayText } from '../../../lib/textUtils';
import type { Step } from '../../../../../shared/types/step';
import type { ChapterBreak } from '../../../../../shared/types/session';

// ─── Sequence ────────────────────────────────────────────────────────────────

type StepFrame    = { type: 'step'; step: Step; stepIndex: number };
type ChapterFrame = { type: 'chapter'; title: string; chapterNum: number };
type EndFrame     = { type: 'end' };
type SeqFrame = StepFrame | ChapterFrame | EndFrame;

function buildSequence(steps: Step[], chapterBreaks?: ChapterBreak[]): SeqFrame[] {
  const seq: SeqFrame[] = [];
  let chapterNum = 1;
  const breakMap = new Map((chapterBreaks ?? []).map((b) => [b.afterStepId, b]));
  steps.forEach((step, i) => {
    if (i > 0) {
      const brk = breakMap.get(steps[i - 1].id);
      if (brk) { chapterNum++; seq.push({ type: 'chapter', title: brk.chapterTitle, chapterNum }); }
    }
    seq.push({ type: 'step', step, stepIndex: i });
  });
  seq.push({ type: 'end' });
  return seq;
}

// ─── Overlays ────────────────────────────────────────────────────────────────

function CalloutOverlay({ x, y, text, brand }: { x: number; y: number; text: string; brand: string }) {
  return (
    <div style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, calc(-100% - 14px))', zIndex: 18, pointerEvents: 'none' }}>
      <div style={{ background: brand, color: '#fff', fontSize: 11.5, fontWeight: 600, padding: '5px 10px', borderRadius: 7, whiteSpace: 'nowrap', boxShadow: `0 8px 24px ${withAlpha(brand, 0.45)}`, position: 'relative' }}>
        {text}
        <span style={{ position: 'absolute', left: '50%', bottom: -5, transform: 'translateX(-50%) rotate(45deg)', width: 9, height: 9, background: brand, borderRadius: 1 }} />
      </div>
    </div>
  );
}

function BlurMask({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <div style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`, backdropFilter: 'blur(7px)', WebkitBackdropFilter: 'blur(7px)', background: 'rgba(255,255,255,0.04)', borderRadius: 6, zIndex: 16, border: '1px solid rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
  );
}

// ─── Nav buttons ─────────────────────────────────────────────────────────────

function NavBtn({ children, onClick, disabled, primary, brand }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; primary?: boolean; brand?: string }) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ width: 34, height: 30, borderRadius: 8, cursor: disabled ? 'default' : 'pointer', display: 'grid', placeItems: 'center', border: '1px solid', borderColor: primary ? 'transparent' : 'rgba(255,255,255,0.1)', background: primary && brand ? brand : h && !disabled ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)', color: primary ? '#fff' : disabled ? 'rgba(255,255,255,0.25)' : '#fff', boxShadow: primary && brand ? `0 6px 16px ${withAlpha(brand, 0.4)}` : 'none', transition: 'background 0.15s' }}>
      {children}
    </button>
  );
}

function ChromeBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick?: () => void }) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} title={label}
      style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: h ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.8)', display: 'grid', placeItems: 'center', cursor: 'pointer', transition: 'background 0.15s' }}>
      {children}
    </button>
  );
}

// ─── Info panel ───────────────────────────────────────────────────────────────

function InfoPanel({ step, stepIndex, totalSteps, brand, onPrev, onNext, atStart }: {
  step: Step; stepIndex: number; totalSteps: number; brand: string;
  onPrev: () => void; onNext: () => void; atStart: boolean;
}) {
  const title = step.stepTitle;
  const body  = displayText(step.textOverride || step.generatedText);

  const shell: React.CSSProperties = { width: '100%', marginTop: 16, padding: '15px 17px', borderRadius: 13, background: 'rgba(20,20,23,0.72)', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' };

  const badge = (
    <div style={{ flex: 'none', minWidth: 52, height: 30, padding: '0 11px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{stepIndex + 1}</span>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>/ {totalSteps}</span>
    </div>
  );

  const arrows = (
    <div style={{ flex: 'none', display: 'flex', gap: 7 }}>
      <NavBtn onClick={onPrev} disabled={atStart}><I.ChevronLeft size={17} /></NavBtn>
      <NavBtn onClick={onNext} primary brand={brand}><I.ChevronRight size={17} /></NavBtn>
    </div>
  );

  return (
    <div key={stepIndex} className="dm-fade-up" style={shell}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        {badge}
        <div style={{ flex: 1, minWidth: 0 }}>
          {title && <div style={{ fontSize: 15.5, fontWeight: 600, color: '#fff', letterSpacing: '-0.01em', lineHeight: 1.3 }}>{title}</div>}
          {body  && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.66)', lineHeight: 1.5, marginTop: title ? 3 : 0 }}>{body}</div>}
        </div>
        {arrows}
      </div>
    </div>
  );
}

// ─── Chapter screen ───────────────────────────────────────────────────────────

function ChapterScreen({ title, chapterNum, brand, onContinue }: { title: string; chapterNum: number; brand: string; onContinue: () => void }) {
  return (
    <div className="dm-fade-up" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 40, background: `radial-gradient(100% 100% at 50% 0%, ${withAlpha(brand, 0.4)} 0%, rgba(8,8,10,0.6) 55%, #08080a 100%)` }}>
      <div style={{ maxWidth: 520 }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: withAlpha(brand, 0.95), marginBottom: 18 }}>Chapter {chapterNum}</div>
        <div style={{ fontSize: 44, fontWeight: 700, color: '#fff', letterSpacing: '-0.025em', lineHeight: 1.05 }}>{title}</div>
        <button onClick={onContinue} style={{ marginTop: 30, padding: '13px 26px', borderRadius: 11, border: 'none', background: brand, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 9, boxShadow: `0 12px 34px ${withAlpha(brand, 0.45)}` }}>
          Continue <I.ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}

// ─── End screen ───────────────────────────────────────────────────────────────

function EndScreen({ brand, onReplay }: { brand: string; onReplay: () => void }) {
  return (
    <div className="dm-fade-up" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 40, background: `radial-gradient(110% 90% at 50% 12%, ${withAlpha(brand, 0.42)} 0%, rgba(8,8,10,0.7) 50%, #08080a 100%)` }}>
      <div style={{ maxWidth: 560 }}>
        <div style={{ width: 60, height: 60, borderRadius: 16, background: brand, display: 'grid', placeItems: 'center', margin: '0 auto 26px', boxShadow: `0 14px 40px ${withAlpha(brand, 0.5)}`, color: '#fff' }}>
          <I.Check size={30} strokeWidth={2.5} />
        </div>
        <div style={{ fontSize: 50, fontWeight: 700, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1 }}>That's a wrap!</div>
        <div style={{ fontSize: 17, color: 'rgba(255,255,255,0.62)', marginTop: 16, lineHeight: 1.5 }}>You just saw the whole flow — in under two minutes.</div>
        <div style={{ marginTop: 32, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={onReplay} style={{ padding: '14px 22px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 15, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <I.RotateCcw size={16} /> Replay
          </button>
        </div>
        <div style={{ marginTop: 30, fontSize: 12, color: 'rgba(255,255,255,0.3)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          Made with <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>StudioBase</span>
        </div>
      </div>
    </div>
  );
}

// ─── Screenshot card ──────────────────────────────────────────────────────────

function ScreenshotCard({ step, session, brand, hotspotStyle, progress, onHotspot }: {
  step: Step; session: any; brand: string; hotspotStyle: HotspotStyle; progress: number; onHotspot: () => void;
}) {
  const coords = step.coordinates;
  const hotspotX = coords && coords.viewportWidth > 0 ? (coords.x / coords.viewportWidth) * 100 : null;
  const hotspotY = coords && coords.viewportHeight > 0 ? (coords.y / coords.viewportHeight) * 100 : null;
  const callouts = (step.annotations ?? []).filter((a) => (a.shape === 'callout' || a.shape === 'text') && a.text);
  const blurs    = (step.annotations ?? []).filter((a) => a.shape === 'blur');
  const screenshotUrl = step.screenshotKey && session?.assets?.[step.screenshotKey] ? session.assets[step.screenshotKey] : null;

  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 14, overflow: 'hidden', background: '#111', boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)' }}>
      {/* Progress bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'rgba(0,0,0,0.12)', zIndex: 30 }}>
        <div style={{ height: '100%', width: `${progress * 100}%`, background: brand, transition: 'width 0.5s cubic-bezier(0.22,1,0.36,1)', boxShadow: `0 0 10px ${withAlpha(brand, 0.7)}` }} />
      </div>
      {screenshotUrl ? (
        <img src={screenshotUrl} alt={`Step ${step.sequence}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} draggable={false} />
      ) : (
        <ScreenshotPlaceholder step={step} session={session} showChrome={false} aspect="16/9" rounded="" mode="stage" className="w-full h-full !shadow-none" />
      )}
      {blurs.map((a, i) => <BlurMask key={i} x={a.x} y={a.y} w={a.width ?? 10} h={a.height ?? 5} />)}
      {callouts.map((a, i) => <CalloutOverlay key={i} x={a.x} y={a.y} text={a.text!} brand={brand} />)}
      {hotspotX !== null && hotspotY !== null && (
        <Hotspot style={hotspotStyle} brand={brand} white={hotspotStyle !== 'arrow' && hotspotStyle !== 'ring'} x={hotspotX} y={hotspotY} size={20} onClick={onHotspot} title="Next" />
      )}
    </div>
  );
}

// ─── Keyboard hints ───────────────────────────────────────────────────────────

function ShortcutsHint() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <ChromeBtn label="Keyboard shortcuts" onClick={() => setOpen((v) => !v)}>
        <I.Info size={16} />
      </ChromeBtn>
      {open && (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, padding: '12px 14px', background: 'rgba(18,18,20,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', fontSize: 12, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap', zIndex: 50, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[['→ / Space', 'Next step'], ['←', 'Previous step'], ['F', 'Fullscreen'], ['Esc', 'Exit']].map(([k, l]) => (
            <div key={k} style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <kbd style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.08)', padding: '2px 7px', borderRadius: 5, fontSize: 11 }}>{k}</kbd>
              <span>{l}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Watermark ────────────────────────────────────────────────────────────────

export function Watermark() {
  return (
    <div style={{ position: 'absolute', bottom: 12, left: 16, fontSize: 11, color: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'none', zIndex: 30 }}>
      Made with <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.35)' }}>StudioBase</span>
    </div>
  );
}

// ─── Main viewer ──────────────────────────────────────────────────────────────

export const EmbedDemoView: React.FC = () => {
  const session  = useStudioStore((s) => s.session);
  const brand    = useStudioStore((s) => s.brand.primaryColor) || '#6366f1';

  const [hotspotStyle] = useState<HotspotStyle>('pulse');
  const [idx, setIdx]  = useState(0);
  const [fs,  setFs]   = useState(false);

  const steps = session?.steps ?? [];
  const seq   = React.useMemo(() => buildSequence(steps, session?.metadata?.chapterBreaks), [steps, session?.metadata?.chapterBreaks]);

  const go = useCallback((d: number) => setIdx((i) => Math.max(0, Math.min(seq.length - 1, i + d))), [seq.length]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'f' || e.key === 'F') setFs((v) => !v);
      else if (e.key === 'Escape') setFs(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [go]);

  const frame = seq[idx];
  if (!frame || !session) return null;

  const progress = frame.type === 'step' ? (frame.stepIndex + 1) / steps.length : frame.type === 'end' ? 1 : 0;
  const cardWidth = fs ? 'min(1120px, 92%)' : 'min(940px, 78%)';

  return (
    <div style={{ position: 'absolute', inset: 0, background: brandGradient(brand, 0.5), overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Top-right chrome */}
      {frame.type === 'step' && (
        <div style={{ position: 'absolute', top: 18, right: 20, display: 'flex', gap: 8, zIndex: 40 }}>
          <ChromeBtn label={fs ? 'Exit fullscreen (F)' : 'Fullscreen (F)'} onClick={() => setFs((v) => !v)}>
            {fs ? <I.Minimize2 size={16} /> : <I.Maximize size={16} />}
          </ChromeBtn>
          <ShortcutsHint />
        </div>
      )}

      <Watermark />

      {frame.type === 'chapter' && <ChapterScreen title={frame.title} chapterNum={frame.chapterNum} brand={brand} onContinue={() => go(1)} />}
      {frame.type === 'end'     && <EndScreen brand={brand} onReplay={() => setIdx(0)} />}
      {frame.type === 'step'    && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '52px 24px 28px' }}>
          <div style={{ width: cardWidth, transition: 'width 0.3s ease', display: 'flex', flexDirection: 'column' }}>
            <ScreenshotCard step={frame.step} session={session} brand={brand} hotspotStyle={hotspotStyle} progress={progress} onHotspot={() => go(1)} />
            <InfoPanel step={frame.step} stepIndex={frame.stepIndex} totalSteps={steps.length} brand={brand} onPrev={() => go(-1)} onNext={() => go(1)} atStart={idx === 0} />
          </div>
        </div>
      )}
    </div>
  );
};
