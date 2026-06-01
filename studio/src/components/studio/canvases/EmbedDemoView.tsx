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

function CalloutCard({
  ov,
  brand,
  onClick,
}: {
  ov: any;
  brand: string;
  onClick?: () => void;
}) {
  const dir = ov.arrowDir ?? 'none';
  const showArrow = ov.showArrow !== false;
  const bgColor = ov.bgColor ?? '#18181b';
  const textColor = ov.textColor ?? '#ffffff';

  // Boundary Clamping (between 5% and 95%)
  const clampedX = Math.min(95, Math.max(5, ov.pctX));
  const clampedY = Math.min(95, Math.max(5, ov.pctY));

  // Translation & 12px Offset Math based on arrow direction
  let transformStr = 'translate(-50%, -50%)';
  let arrowStyle: React.CSSProperties = {};

  if (dir === 't') {
    transformStr = 'translate(-50%, 12px)';
    arrowStyle = {
      top: -5,
      left: '50%',
      transform: 'translateX(-50%) rotate(45deg)',
    };
  } else if (dir === 'b') {
    transformStr = 'translate(-50%, calc(-100% - 12px))';
    arrowStyle = {
      bottom: -5,
      left: '50%',
      transform: 'translateX(-50%) rotate(45deg)',
    };
  } else if (dir === 'l') {
    transformStr = 'translate(12px, -50%)';
    arrowStyle = {
      left: -5,
      top: '50%',
      transform: 'translateY(-50%) rotate(45deg)',
    };
  } else if (dir === 'r') {
    transformStr = 'translate(calc(-100% - 12px), -50%)';
    arrowStyle = {
      right: -5,
      top: '50%',
      transform: 'translateY(-50%) rotate(45deg)',
    };
  }

  // Handle empty states & placeholder spacing
  const hasTitle = !!ov.title;
  const hasBody = !!ov.body;
  const hasContent = hasTitle || hasBody;

  // Next / action button visibility
  const showButton = ov.destination !== 'stay';
  const buttonLabel = ov.destination === 'specific'
    ? `Go to step ${ov.destinationStep ?? 1} →`
    : 'Next →';

  // If no content exists in viewer, do not render at all
  if (!hasContent) return null;

  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        left: `${clampedX}%`,
        top: `${clampedY}%`,
        transform: transformStr,
        zIndex: 22,
        cursor: onClick ? 'pointer' : 'default',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          background: bgColor,
          color: textColor,
          padding: '10px 14px',
          borderRadius: 10,
          border: '1.5px solid rgba(255,255,255,0.12)',
          boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
          minWidth: 160,
          maxWidth: 240,
          boxSizing: 'border-box',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        {/* Title */}
        {hasTitle && (
          <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.25 }}>
            {ov.title}
          </div>
        )}

        {/* Body */}
        {hasBody && (
          <div style={{ fontSize: 11.5, lineHeight: 1.45, opacity: 0.9, whiteSpace: 'pre-wrap' }}>
            {ov.body}
          </div>
        )}

        {/* Next / Navigation Button */}
        {showButton && (
          <div
            style={{
              marginTop: 4,
              padding: '5px 11px',
              borderRadius: 6,
              background: brand,
              color: '#ffffff',
              fontSize: 11,
              fontWeight: 700,
              textAlign: 'center',
              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
              display: 'inline-block',
              alignSelf: 'flex-start',
              cursor: 'pointer',
            }}
          >
            {buttonLabel}
          </div>
        )}

        {/* Rotated arrow element */}
        {showArrow && dir !== 'none' && (
          <span
            style={{
              position: 'absolute',
              width: 10,
              height: 10,
              background: bgColor,
              borderLeft: dir === 'r' ? 'none' : '1.5px solid rgba(255,255,255,0.08)',
              borderTop: dir === 'b' ? 'none' : '1.5px solid rgba(255,255,255,0.08)',
              borderRight: dir === 'l' ? 'none' : '1.5px solid rgba(255,255,255,0.08)',
              borderBottom: dir === 't' ? 'none' : '1.5px solid rgba(255,255,255,0.08)',
              zIndex: -1,
              boxSizing: 'border-box',
              ...arrowStyle,
            }}
          />
        )}
      </div>
    </div>
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

function EndScreen({ brand, onReplay, session }: { brand: string; onReplay: () => void; session: any }) {
  const es = session?.metadata?.endScreen ?? {};
  const headline    = es.headline    || "That's a wrap!";
  const subheadline = es.subheadline || 'You just saw the whole flow — in under two minutes.';
  const ctaLabel    = es.ctaLabel;
  const ctaUrl      = es.ctaUrl;
  return (
    <div className="dm-fade-up" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 40, background: `radial-gradient(110% 90% at 50% 12%, ${withAlpha(brand, 0.42)} 0%, rgba(8,8,10,0.7) 50%, #08080a 100%)` }}>
      <div style={{ maxWidth: 560 }}>
        <div style={{ width: 60, height: 60, borderRadius: 16, background: brand, display: 'grid', placeItems: 'center', margin: '0 auto 26px', boxShadow: `0 14px 40px ${withAlpha(brand, 0.5)}`, color: '#fff' }}>
          <I.Check size={30} strokeWidth={2.5} />
        </div>
        <div style={{ fontSize: 50, fontWeight: 700, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1 }}>{headline}</div>
        <div style={{ fontSize: 17, color: 'rgba(255,255,255,0.62)', marginTop: 16, lineHeight: 1.5 }}>{subheadline}</div>
        <div style={{ marginTop: 32, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {ctaLabel && ctaUrl && (
            <a href={ctaUrl} target="_blank" rel="noopener noreferrer" style={{ padding: '14px 26px', borderRadius: 12, border: 'none', background: brand, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', boxShadow: `0 12px 32px ${withAlpha(brand, 0.45)}` }}>
              {ctaLabel} <I.ArrowRight size={16} />
            </a>
          )}
          <button onClick={onReplay} style={{ padding: '14px 22px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 15, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <I.RotateCcw size={16} /> Replay
          </button>
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

function ScreenshotCard({ step, session, brand, hotspotStyle, progress, onNavigate, cursorTween }: {
  step: Step; session: any; brand: string; hotspotStyle: HotspotStyle; progress: number; onNavigate: (ov: any) => void;
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
          return (
            <SpotlightMask
              key={ov.id}
              rect={{ x: ov.pctX, y: ov.pctY, w: ov.w, h: ov.h }}
              shape={ov.shape ?? 'rounded'}
              overlayOpacity={ov.overlayOpacity ?? 55}
              borderColor={ov.borderColor ?? brand}
              onClick={ov.destination !== 'stay' ? () => onNavigate(ov) : undefined}
            />
          );
        }
        if (ov.type === 'hotspot' && !ov.invisible) {
          return <Hotspot key={ov.id} style={hotspotStyle} brand={brand} white x={ov.pctX} y={ov.pctY} size={20} onClick={ov.destination !== 'stay' ? () => onNavigate(ov) : undefined} title={ov.title} />;
        }
        if (ov.type === 'callout') {
          return (
            <CalloutCard
              key={ov.id}
              ov={ov}
              brand={brand}
              onClick={ov.destination !== 'stay' ? () => onNavigate(ov) : undefined}
            />
          );
        }
        return null;
      })}
      {hotspotX !== null && hotspotY !== null && !cursorTween && (
        <Hotspot style={hotspotStyle} brand={brand} white={hotspotStyle !== 'arrow' && hotspotStyle !== 'ring'} x={hotspotX} y={hotspotY} size={hotspotSz} onClick={() => onNavigate({ destination: 'next' })} title="Next" />
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

export function Watermark({ hidden }: { hidden?: boolean }) {
  if (hidden) return null;
  return (
    <div style={{ position: 'absolute', bottom: 12, left: 16, fontSize: 11, color: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'none', zIndex: 30 }}>
      Made with <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.35)' }}>StudioBase</span>
    </div>
  );
}

// ─── Password gate ────────────────────────────────────────────────────────────

function PasswordGate({ brand, onUnlock }: { brand: string; onUnlock: () => void }) {
  const [val, setVal] = useState('');
  const [err, setErr] = useState(false);
  const session = useStudioStore((s) => s.session);
  const check = () => {
    if (val === (session?.metadata as any)?.password) { onUnlock(); }
    else { setErr(true); setTimeout(() => setErr(false), 1200); }
  };
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#08080a' }}>
      <div style={{ width: 320, textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: withAlpha(brand, 0.15), border: `1px solid ${withAlpha(brand, 0.3)}`, display: 'grid', placeItems: 'center', margin: '0 auto 20px' }}>
          <I.Lock size={22} color={brand} />
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Protected demo</div>
        <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.45)', marginBottom: 24 }}>Enter the password to continue</div>
        <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && check()}
          type="password" placeholder="Password"
          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: `1px solid ${err ? '#f87171' : 'rgba(255,255,255,0.12)'}`, borderRadius: 10, color: '#fff', fontSize: 15, padding: '12px 14px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 0.2s', marginBottom: 10 }} />
        <button onClick={check} style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: brand, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', boxShadow: `0 8px 24px ${withAlpha(brand, 0.4)}` }}>
          Unlock
        </button>
        {err && <div style={{ marginTop: 10, fontSize: 12, color: '#f87171' }}>Incorrect password</div>}
      </div>
    </div>
  );
}

// ─── Countdown ring ───────────────────────────────────────────────────────────

function CountdownRing({ seconds, brand }: { seconds: number; brand: string }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    setOffset(0);
    const start = Date.now();
    const raf = () => {
      const elapsed = (Date.now() - start) / 1000;
      const progress = Math.min(elapsed / seconds, 1);
      setOffset(circ * (1 - progress));
      if (progress < 1) requestAnimationFrame(raf);
    };
    const id = requestAnimationFrame(raf);
    return () => cancelAnimationFrame(id);
  }, [seconds, circ]);
  return (
    <svg width={48} height={48} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 24, pointerEvents: 'none' }}>
      <circle cx={24} cy={24} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={2.5} />
      <circle cx={24} cy={24} r={r} fill="none" stroke={brand} strokeWidth={2.5}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transform: 'rotate(-90deg)', transformOrigin: '24px 24px', transition: 'stroke-dashoffset 0.1s linear' }} />
    </svg>
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

export const EmbedDemoView: React.FC<{ sessionOverride?: any; readOnly?: boolean }> = ({ sessionOverride }) => {
  const storeSession = useStudioStore((s) => s.session);
  const session  = sessionOverride ?? storeSession;
  const brand    = useStudioStore((s) => s.brand.primaryColor) || '#6366f1';

  const meta           = (session?.metadata as any) ?? {};
  const demoBrand      = meta.demoBrand ?? {};
  const fontFamily     = demoBrand.fontFamily ? `${demoBrand.fontFamily}, Inter, system-ui, sans-serif` : undefined;
  const showWatermark  = demoBrand.watermark !== false;
  const logoUrl        = demoBrand.logoUrl ?? null;
  const pwRequired     = !!meta.password;
  const autoplayCfg    = meta.autoplay ?? { enabled: false, intervalSeconds: 5 };
  const transitionStyle: 'cut' | 'crossfade' = meta.transitionStyle ?? 'crossfade';

  const [hotspotStyle] = useState<HotspotStyle>('pulse');
  const [idx, setIdx]  = useState(0);
  const [fs,  setFs]   = useState(false);
  const [unlocked, setUnlocked] = useState(() => {
    if (!pwRequired) return true;
    const params = new URLSearchParams(window.location.search);
    return params.get('pw') === meta.password;
  });

  // Cursor tween tracking
  const prevHotspotRef = useRef<{ x: number; y: number } | null>(null);
  const [activeTween, setActiveTween] = useState<CursorTween | null>(null);

  const steps = session?.steps ?? [];
  const seq   = React.useMemo(() => buildSequence(steps, meta.chapterBreaks), [steps, meta.chapterBreaks]);

  const go = useCallback((d: number) => setIdx((i) => Math.max(0, Math.min(seq.length - 1, i + d))), [seq.length]);

  const handleOverlayClick = useCallback((ov: any) => {
    if (ov.destination === 'stay') {
      return;
    }
    if (ov.destination === 'specific') {
      const stepNum = ov.destinationStep ?? 1;
      const targetIndex = seq.findIndex(
        (f) => f.type === 'step' && f.stepIndex === stepNum - 1
      );
      if (targetIndex !== -1) {
        setIdx(targetIndex);
      }
      return;
    }
    // Default to next step
    go(1);
  }, [seq, go]);

  // Keyboard nav
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

  // Autoplay
  useEffect(() => {
    if (!autoplayCfg.enabled || !unlocked) return;
    const t = setInterval(() => go(1), autoplayCfg.intervalSeconds * 1000);
    return () => clearInterval(t);
  }, [autoplayCfg.enabled, autoplayCfg.intervalSeconds, go, unlocked]);

  const frame = seq[idx];

  // Cursor tween
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

  if (!session) return null;
  if (!unlocked) return <PasswordGate brand={brand} onUnlock={() => setUnlocked(true)} />;
  if (!frame) return null;

  const progress = frame.type === 'step' ? (frame.stepIndex + 1) / steps.length : frame.type === 'end' ? 1 : 0;
  const cardWidth = fs ? 'min(1120px, 92%)' : 'min(940px, 78%)';
  const background = resolveBackground(session, brand);

  return (
    <div style={{ position: 'absolute', inset: 0, background, overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily }} onClick={() => {}}>
      {/* Logo top-left */}
      {logoUrl && (
        <div style={{ position: 'absolute', top: 16, left: 20, zIndex: 40 }}>
          <img src={logoUrl} alt="logo" style={{ height: 28, objectFit: 'contain' }} />
        </div>
      )}

      {/* Top-right chrome */}
      {frame.type === 'step' && (
        <div style={{ position: 'absolute', top: 18, right: 20, display: 'flex', gap: 8, zIndex: 40 }}>
          <ChromeBtn label={fs ? 'Exit fullscreen (F)' : 'Fullscreen (F)'} onClick={() => setFs((v) => !v)}>
            {fs ? <I.Minimize2 size={16} /> : <I.Maximize size={16} />}
          </ChromeBtn>
          <ShortcutsHint />
        </div>
      )}

      <Watermark hidden={!showWatermark} />

      {frame.type === 'chapter' && <ChapterScreen title={frame.title} chapterNum={frame.chapterNum} brand={brand} onContinue={() => go(1)} />}
      {frame.type === 'end'     && <EndScreen brand={brand} onReplay={() => setIdx(0)} session={session} />}
      {frame.type === 'step'    && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '52px 24px 28px' }} onClick={(e) => e.stopPropagation()}>
          <div style={{ width: cardWidth, transition: 'width 0.3s ease', display: 'flex', flexDirection: 'column' }}>
            <div key={frame.stepIndex} className={transitionStyle === 'crossfade' ? 'dm-fade' : undefined} style={{ position: 'relative' }}>
              <ScreenshotCard step={frame.step} session={session} brand={brand} hotspotStyle={hotspotStyle} progress={progress} onNavigate={handleOverlayClick} cursorTween={activeTween} />
              {/* Countdown ring overlays the hotspot when autoplay is on */}
              {autoplayCfg.enabled && frame.stepIndex < steps.length - 1 && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                  <CountdownRing key={`${frame.stepIndex}-${idx}`} seconds={autoplayCfg.intervalSeconds} brand={brand} />
                </div>
              )}
            </div>
            <InfoPanel step={frame.step} stepIndex={frame.stepIndex} totalSteps={steps.length} brand={brand} onPrev={() => go(-1)} onNext={() => go(1)} atStart={idx === 0} />
          </div>
        </div>
      )}
    </div>
  );
};
