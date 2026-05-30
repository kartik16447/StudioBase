import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useStudioStore } from '../../../store/useStudioStore';
import { I } from '../../icons';
import { ScreenshotPlaceholder } from '../../ui';
import { Hotspot } from '../../demo/Hotspot';
import type { HotspotStyle } from '../../demo/Hotspot';
import { withAlpha, brandGradient } from '../../demo/helpers';
import { displayText } from '../../../lib/textUtils';
import type { Step, DemoCard, Overlay } from '../../../../../shared/types/step';
import { SpotlightMask } from '../../demo/SpotlightMask';
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
  const cards: DemoCard[] = (step as any).cards ?? [];

  const ctaCard   = cards.find((c) => c.type === 'cta');
  const videoCard = cards.find((c) => c.type === 'video');
  const formCard  = cards.find((c) => c.type === 'form');

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

          {/* Video card embed */}
          {videoCard?.videoUrl && (
            <div style={{ marginTop: 10, borderRadius: 9, overflow: 'hidden', aspectRatio: '16/9', background: '#000' }}>
              <iframe src={toEmbedUrl(videoCard.videoUrl)} style={{ width: '100%', height: '100%', border: 'none' }} allowFullScreen title="Step video" />
            </div>
          )}

          {/* Form card */}
          {formCard && (formCard.formFields?.length ?? 0) > 0 && (
            <form onSubmit={(e) => e.preventDefault()} style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {formCard.formFields!.map((f) => (
                <div key={f.id}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.55)', display: 'block', marginBottom: 4 }}>{f.label}</label>
                  <input type={f.type} placeholder={f.label} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#fff', fontSize: 13, padding: '8px 10px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
              ))}
              <button type="submit" style={{ marginTop: 2, padding: '9px 16px', borderRadius: 8, border: 'none', background: brand, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Submit
              </button>
            </form>
          )}

          {/* CTA button */}
          {ctaCard?.ctaLabel && (
            <div style={{ marginTop: 10 }}>
              <a href={ctaCard.ctaUrl || '#'} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 9, background: brand, color: '#fff', fontSize: 13.5, fontWeight: 600, textDecoration: 'none', boxShadow: `0 8px 22px ${withAlpha(brand, 0.45)}` }}>
                {ctaCard.ctaLabel} <I.ArrowRight size={15} />
              </a>
            </div>
          )}
        </div>
        {arrows}
      </div>
    </div>
  );
}

function toEmbedUrl(url: string): string {
  // YouTube
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  // Loom
  const loom = url.match(/loom\.com\/share\/([a-f0-9]+)/);
  if (loom) return `https://www.loom.com/embed/${loom[1]}`;
  return url;
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

type CursorTween = { fromX: number; fromY: number; toX: number; toY: number };

function CursorTweenOverlay({ tween, brand }: { tween: CursorTween; brand: string }) {
  const [pos, setPos] = useState({ x: tween.fromX, y: tween.fromY });
  useEffect(() => {
    const raf = requestAnimationFrame(() => setPos({ x: tween.toX, y: tween.toY }));
    return () => cancelAnimationFrame(raf);
  }, [tween.toX, tween.toY]);
  return (
    <div style={{ position: 'absolute', left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-4px, -4px)', transition: 'left 400ms cubic-bezier(0.22,1,0.36,1), top 400ms cubic-bezier(0.22,1,0.36,1)', zIndex: 26, pointerEvents: 'none' }}>
      <svg width="22" height="26" viewBox="0 0 22 26" fill="none">
        <path d="M3 2.5l16 9.5-7.5 2.5L8 23z" fill={brand} stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function ScreenshotCard({ step, session, brand, hotspotStyle, progress, onHotspot, cursorTween }: {
  step: Step; session: any; brand: string; hotspotStyle: HotspotStyle; progress: number; onHotspot: () => void;
  cursorTween?: CursorTween | null;
}) {
  const coords    = step.coordinates;
  const rawX      = coords && coords.viewportWidth  > 0 ? (coords.x / coords.viewportWidth)  * 100 : null;
  const rawY      = coords && coords.viewportHeight > 0 ? (coords.y / coords.viewportHeight) * 100 : null;
  // Prefer creator-repositioned value; fall back to raw recorded coordinate
  const hotspotX  = step.animationTarget?.pctX  ?? rawX;
  const hotspotY  = step.animationTarget?.pctY  ?? rawY;
  const hotspotSz = step.animationTarget?.hotspotSize ?? 20;
  const cards: DemoCard[] = (step as any).cards ?? [];
  const overlays: Overlay[] = (step as any).overlays ?? [];
  const callouts = (step.annotations ?? []).filter((a) => a.shape === 'text' && a.text);
  const blurs    = (step.annotations ?? []).filter((a) => a.shape === 'blur');
  const cardBlurs    = cards.filter((c) => c.type === 'blur'    && c.rect);
  const cardCallouts = cards.filter((c) => c.type === 'callout' && c.rect);
  const screenshotUrl = step.screenshotKey && session?.assets?.[step.screenshotKey] ? session.assets[step.screenshotKey] : null;

  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 14, overflow: 'hidden', background: '#111', boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)' }}>
      {/* Progress bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'rgba(0,0,0,0.12)', zIndex: 30 }}>
        <div style={{ height: '100%', width: `${progress * 100}%`, background: brand, transition: 'width 0.5s cubic-bezier(0.22,1,0.36,1)', boxShadow: `0 0 10px ${withAlpha(brand, 0.7)}` }} />
      </div>
      {screenshotUrl ? (() => {
        const zoom = step.animationTarget?.zoomScale ?? 1;
        const px   = hotspotX ?? 50;
        const py   = hotspotY ?? 50;
        const imgStyle: React.CSSProperties = zoom > 1 ? {
          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
          transformOrigin: '0 0',
          transform: `translate(${50 - zoom * px}%, ${50 - zoom * py}%) scale(${zoom})`,
          transition: 'transform 350ms cubic-bezier(0.22,1,0.36,1)',
        } : {
          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
          transition: 'transform 350ms cubic-bezier(0.22,1,0.36,1)',
        };
        return <img src={screenshotUrl} alt={`Step ${step.sequence}`} style={imgStyle} draggable={false} />;
      })() : (
        <ScreenshotPlaceholder step={step} session={session} showChrome={false} aspect="16/9" rounded="" mode="stage" className="w-full h-full !shadow-none" />
      )}
      {blurs.map((a, i) => <BlurMask key={i} x={a.x} y={a.y} w={a.width ?? 10} h={a.height ?? 5} />)}
      {cardBlurs.map((c) => <BlurMask key={c.id} x={c.rect!.x} y={c.rect!.y} w={c.rect!.w} h={c.rect!.h} />)}
      {callouts.map((a, i) => <CalloutOverlay key={i} x={a.x} y={a.y} text={a.text!} brand={brand} />)}
      {cardCallouts.map((c) => <CalloutOverlay key={c.id} x={c.rect!.x} y={c.rect!.y} text={c.body || 'Note'} brand={c.color || brand} />)}
      {/* Overlay layer */}
      {overlays.map((ov) => {
        if (ov.type === 'spotlight' && ov.w && ov.h) {
          return <SpotlightMask key={ov.id} rect={{ x: ov.pctX, y: ov.pctY, w: ov.w, h: ov.h }} shape={ov.shape ?? 'rounded'} overlayOpacity={ov.overlayOpacity ?? 55} borderColor={ov.borderColor ?? brand} />;
        }
        if (ov.type === 'hotspot' && !ov.invisible) {
          return <Hotspot key={ov.id} style={hotspotStyle} brand={brand} white x={ov.pctX} y={ov.pctY} size={20} onClick={ov.destination === 'next' ? onHotspot : undefined} title={ov.title} />;
        }
        if (ov.type === 'callout') {
          return (
            <div key={ov.id} style={{ position: 'absolute', left: `${ov.pctX}%`, top: `${ov.pctY}%`, transform: 'translate(-50%,-50%)', zIndex: 22, pointerEvents: 'none' }}>
              <div style={{ background: ov.bgColor ?? 'rgba(20,20,23,0.9)', color: ov.textColor ?? '#fff', fontSize: 12.5, fontWeight: 600, padding: '6px 11px', borderRadius: 8, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)' }}>
                {ov.body || ov.title || 'Note'}
              </div>
            </div>
          );
        }
        return null;
      })}
      {hotspotX !== null && hotspotY !== null && !cursorTween && (
        <Hotspot style={hotspotStyle} brand={brand} white={hotspotStyle !== 'arrow' && hotspotStyle !== 'ring'} x={hotspotX} y={hotspotY} size={hotspotSz} onClick={onHotspot} title="Next" />
      )}
      {cursorTween && <CursorTweenOverlay tween={cursorTween} brand={brand} />}
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

function resolveBackground(session: any, brand: string): string {
  const bg = session?.metadata?.demoBackground;
  if (!bg) return brandGradient(brand, 0.5);
  if (bg.type === 'color') return bg.value;
  if (bg.type === 'gradient') return bg.value;
  if (bg.type === 'image') return `url(${bg.value}) center/cover no-repeat`;
  return brandGradient(brand, 0.5);
}

function getHotspotCoords(step: Step): { x: number; y: number } | null {
  const coords = step.coordinates;
  const rawX = coords && coords.viewportWidth  > 0 ? (coords.x / coords.viewportWidth)  * 100 : null;
  const rawY = coords && coords.viewportHeight > 0 ? (coords.y / coords.viewportHeight) * 100 : null;
  const x = step.animationTarget?.pctX ?? rawX;
  const y = step.animationTarget?.pctY ?? rawY;
  return x !== null && y !== null ? { x, y } : null;
}

export const EmbedDemoView: React.FC = () => {
  const session  = useStudioStore((s) => s.session);
  const brand    = useStudioStore((s) => s.brand.primaryColor) || '#6366f1';

  const [hotspotStyle] = useState<HotspotStyle>('pulse');
  const [idx, setIdx]  = useState(0);
  const [fs,  setFs]   = useState(false);

  // Cursor tween tracking
  const prevHotspotRef = useRef<{ x: number; y: number } | null>(null);
  const [activeTween, setActiveTween] = useState<CursorTween | null>(null);

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

  // Cursor tween: fire when step changes to a step frame
  useEffect(() => {
    if (frame?.type !== 'step') { prevHotspotRef.current = null; return; }
    const to = getHotspotCoords(frame.step);
    if (prevHotspotRef.current && to) {
      setActiveTween({ fromX: prevHotspotRef.current.x, fromY: prevHotspotRef.current.y, toX: to.x, toY: to.y });
      const t = setTimeout(() => { setActiveTween(null); prevHotspotRef.current = to; }, 450);
      return () => clearTimeout(t);
    }
    prevHotspotRef.current = to;
  }, [idx]);

  if (!frame || !session) return null;

  const progress = frame.type === 'step' ? (frame.stepIndex + 1) / steps.length : frame.type === 'end' ? 1 : 0;
  const cardWidth = fs ? 'min(1120px, 92%)' : 'min(940px, 78%)';
  const background = resolveBackground(session, brand);

  return (
    <div style={{ position: 'absolute', inset: 0, background, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
            {/* Crossfade: key by stepIndex causes remount + dm-fade animation */}
            <div key={frame.stepIndex} className="dm-fade">
              <ScreenshotCard step={frame.step} session={session} brand={brand} hotspotStyle={hotspotStyle} progress={progress} onHotspot={() => go(1)} cursorTween={activeTween} />
            </div>
            <InfoPanel step={frame.step} stepIndex={frame.stepIndex} totalSteps={steps.length} brand={brand} onPrev={() => go(-1)} onNext={() => go(1)} atStart={idx === 0} />
          </div>
        </div>
      )}
    </div>
  );
};
