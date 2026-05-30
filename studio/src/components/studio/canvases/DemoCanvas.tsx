import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import type {
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useStudioStore } from '../../../store/useStudioStore';

import { I } from '../../../components/icons';
import { ScreenshotPlaceholder, DotGrid } from '../../../components/ui';
import { RenderConstants } from '../../../modules/render-engine/RenderConstants';
import { Hotspot } from '../../../components/demo/Hotspot';
import type { HotspotStyle } from '../../../components/demo/Hotspot';
import { HotspotStylePicker } from '../../../components/demo/HotspotStylePicker';
import { CardTypePicker } from '../../../components/demo/CardTypePicker';
import { withAlpha } from '../../../components/demo/helpers';
import { displayText } from '../../../lib/textUtils';
import type { DemoCard, Overlay } from '../../../../../shared/types/step';
import type { OverlayTool } from '../../../components/demo/OverlayToolbar';

import { EmbedDemoView } from './EmbedDemoView';
import { OverlaySidebar } from '../../../components/demo/OverlaySidebar';
import { SpotlightMask } from '../../../components/demo/SpotlightMask';

// ─── Design tokens ────────────────────────────────────────────────────────────

const zn = {
  bg: '#F5F5F7', panel: '#FFFFFF', panel2: '#F0F0F5',
  border: 'rgba(0,0,0,0.08)', border2: 'rgba(0,0,0,0.14)',
  ink: '#1D1D1F', mute: '#6E6E73', dim: '#AEAEB2', chip: '#E6E6EC',
};







const OVERLAY_HINTS: Record<OverlayTool, string> = {
  hotspot:   'Click on the screenshot to place a hotspot',
  callout:   'Click on the screenshot to place a callout',
  spotlight: 'Click and drag on the screenshot to draw a spotlight',
  zoomFocus: 'Drag a rectangle on the screenshot to set zoom focus',
};


// ─── Step rail ────────────────────────────────────────────────────────────────

function StepRail({ current, setCurrent, brand, session, selectedChapterId, onSelectChapter }: {
  current: number; setCurrent: (i: number) => void; brand: string; session: any;
  selectedChapterId: string | null; onSelectChapter: (afterStepId: string | null) => void;
}) {
  const steps = session?.steps ?? [];
  const chapterBreaks: { afterStepId: string; chapterTitle: string }[] = session?.metadata?.chapterBreaks ?? [];
  const chapterBreakIds = new Set(chapterBreaks.map((b: any) => b.afterStepId));
  return (
    <div className="dm-scroll" style={{ width: 136, flex: 'none', borderRight: `1px solid ${zn.border}`, background: zn.bg, padding: '10px 9px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: zn.dim, padding: '2px 4px 4px' }}>Steps</div>
      {steps.map((step: any, i: number) => {
        const active = i === current && !selectedChapterId;
        const isChapterStart = i > 0 && chapterBreakIds.has(steps[i - 1]?.id);
        const chapterAfterPrev = isChapterStart ? chapterBreaks.find((b: any) => b.afterStepId === steps[i - 1]?.id) : null;
        const chapterActive = chapterAfterPrev && selectedChapterId === chapterAfterPrev.afterStepId;
        return (
          <div key={step.id}>
            {isChapterStart && chapterAfterPrev && (
              <button
                onClick={() => { onSelectChapter(chapterAfterPrev.afterStepId); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 5,
                  margin: '2px 0 4px', padding: '3px 6px', borderRadius: 6, cursor: 'pointer',
                  background: chapterActive ? withAlpha(brand, 0.15) : 'transparent',
                  border: `1px solid ${chapterActive ? withAlpha(brand, 0.4) : 'transparent'}`,
                  textAlign: 'left',
                }}
              >
                <I.BookOpen size={10} color={chapterActive ? brand : zn.dim} />
                <span style={{ fontSize: 10, color: chapterActive ? brand : zn.dim, fontWeight: 600, letterSpacing: '0.04em', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {chapterAfterPrev.chapterTitle || 'Chapter'}
                </span>
              </button>
            )}
            <div onClick={() => { setCurrent(i); onSelectChapter(null); }} style={{ borderRadius: 8, padding: 5, cursor: 'pointer', background: active ? withAlpha(brand, 0.12) : 'transparent', border: `1px solid ${active ? withAlpha(brand, 0.4) : 'transparent'}` }}>
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
      {/* End screen entry */}
      <div style={{ height: 1, background: zn.border, margin: '4px 0' }} />
      <div onClick={() => { setCurrent(steps.length); onSelectChapter(null); }} style={{ borderRadius: 8, padding: 5, cursor: 'pointer', background: current === steps.length && !selectedChapterId ? withAlpha(brand, 0.12) : 'transparent', border: `1px solid ${current === steps.length && !selectedChapterId ? withAlpha(brand, 0.4) : 'transparent'}` }}>
        <div style={{ aspectRatio: '16/10', borderRadius: 5, border: `1px solid ${zn.border}`, background: zn.panel2, display: 'grid', placeItems: 'center' }}>
          <I.Check size={14} color={brand} />
        </div>
        <div style={{ fontSize: 10.5, color: current === steps.length && !selectedChapterId ? zn.ink : zn.mute, fontWeight: current === steps.length && !selectedChapterId ? 600 : 450, marginTop: 4 }}>End screen</div>
      </div>
    </div>
  );
}

// ─── Chapter editor panel ─────────────────────────────────────────────────────

function ChapterEditor({ afterStepId, session, brand, onClose }: {
  afterStepId: string; session: any; brand: string; onClose: () => void;
}) {
  const saveChapterBreaks = useStudioStore((s) => s.saveChapterBreaks);
  const chapterBreaks: { afterStepId: string; chapterTitle: string }[] = session?.metadata?.chapterBreaks ?? [];
  const chapter = chapterBreaks.find((b: any) => b.afterStepId === afterStepId);
  const [title, setTitle] = useState(chapter?.chapterTitle ?? '');

  const handleSave = async () => {
    const updated = chapterBreaks.map((b: any) =>
      b.afterStepId === afterStepId ? { ...b, chapterTitle: title } : b
    );
    await saveChapterBreaks(updated);
  };

  return (
    <div className="dm-scroll" style={{ width: 340, flex: 'none', borderLeft: `1px solid ${zn.border}`, background: zn.bg, padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <I.BookOpen size={14} color={brand} />
          <span style={{ fontSize: 13.5, fontWeight: 700, color: zn.ink }}>Chapter screen</span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: zn.dim, display: 'grid', placeItems: 'center' }}>
          <I.X size={15} />
        </button>
      </div>
      <p style={{ fontSize: 11.5, color: zn.dim, lineHeight: 1.5 }}>
        This interstitial screen appears between steps in the viewer.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: zn.mute, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Chapter title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleSave}
          placeholder="e.g. Getting started"
          style={{
            background: zn.panel2, border: `1px solid ${zn.border2}`, borderRadius: 8,
            padding: '8px 10px', fontSize: 13, color: zn.ink, outline: 'none', width: '100%',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = brand)}
        />
      </div>
      <button
        onClick={handleSave}
        style={{
          padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
          background: brand, color: '#fff', fontSize: 12.5, fontWeight: 600,
        }}
      >
        Save chapter title
      </button>
    </div>
  );
}

function CalloutCard({
  ov,
  selected,
  brand,
  onClick,
  onMouseDown,
  isEditor = false,
}: {
  ov: any;
  selected: boolean;
  brand: string;
  onClick?: (e: React.MouseEvent) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  isEditor?: boolean;
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

  return (
    <div
      onClick={onClick}
      onMouseDown={onMouseDown}
      style={{
        position: 'absolute',
        left: `${clampedX}%`,
        top: `${clampedY}%`,
        transform: transformStr,
        zIndex: selected ? 30 : 22,
        cursor: onClick || onMouseDown ? 'pointer' : 'default',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          background: bgColor,
          color: textColor,
          padding: '10px 14px',
          borderRadius: 10,
          border: selected ? `2.5px solid ${brand}` : '1.5px solid rgba(255,255,255,0.12)',
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

        {/* Placeholder for empty state in Editor */}
        {!hasContent && isEditor && (
          <div style={{ fontSize: 11, fontStyle: 'italic', opacity: 0.65 }}>
            Click to add text
          </div>
        )}

        {/* Next / Navigation Button */}
        {showButton && (hasContent || isEditor) && (
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
              borderLeft: dir === 'r' ? 'none' : selected ? `2.5px solid ${brand}` : '1.5px solid rgba(255,255,255,0.08)',
              borderTop: dir === 'b' ? 'none' : selected ? `2.5px solid ${brand}` : '1.5px solid rgba(255,255,255,0.08)',
              borderRight: dir === 'l' ? 'none' : selected ? `2.5px solid ${brand}` : '1.5px solid rgba(255,255,255,0.08)',
              borderBottom: dir === 't' ? 'none' : selected ? `2.5px solid ${brand}` : '1.5px solid rgba(255,255,255,0.08)',
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

// ─── Browser mock (screenshot + draggable hotspot) ───────────────────────────

const HS_SIZES = [{ label: 'S', v: 14 }, { label: 'M', v: 20 }, { label: 'L', v: 28 }];

function BrowserMock({ step, session, brand, hotspotStyle, onUpdateHotspot, activeTool, onPlaceOverlay, onClearTool, selectedOverlayId, onSelectOverlay, onUpdateOverlay }: {
  step: any; session: any; brand: string; hotspotStyle: HotspotStyle;
  onUpdateHotspot: (pctX: number, pctY: number, hotspotSize?: number, zoomScale?: number) => void;
  activeTool: OverlayTool | null;
  onPlaceOverlay: (pctX: number, pctY: number) => void;
  onClearTool: () => void;
  selectedOverlayId: string | null;
  onSelectOverlay: (id: string | null) => void;
  onUpdateOverlay?: (patch: Partial<Overlay>, overlayId?: string) => void;
}) {
  const coords  = step?.coordinates;
  const rawX    = coords && coords.viewportWidth  > 0 ? (coords.x / coords.viewportWidth)  * 100 : 50;
  const rawY    = coords && coords.viewportHeight > 0 ? (coords.y / coords.viewportHeight) * 100 : 50;

  const savedX      = step?.animationTarget?.pctX;
  const savedY      = step?.animationTarget?.pctY;
  const currentSize: number = step?.animationTarget?.hotspotSize ?? 20;

  const [pos, setPos]   = useState({ x: savedX ?? rawX, y: savedY ?? rawY });
  const dragging        = useRef(false);
  const dragPos         = useRef(pos);
  const screenshotRef   = useRef<HTMLDivElement>(null);

  const [localOverlays, setLocalOverlays] = useState<any[]>(step?.overlays ?? []);
  const draggingOverlayId = useRef<string | null>(null);

  // Zoom-focus rect draw state
  const [focusRect, setFocusRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const focusDragging = useRef(false);
  const focusStart    = useRef<{ x: number; y: number } | null>(null);

  // Sync when step switches
  useEffect(() => {
    const x = step?.animationTarget?.pctX ?? rawX;
    const y = step?.animationTarget?.pctY ?? rawY;
    setPos({ x, y });
    dragPos.current = { x, y };
    setFocusRect(null);
  }, [step?.id]);

  // Sync overlays safely
  useEffect(() => {
    if (!draggingOverlayId.current) {
      setLocalOverlays(step?.overlays ?? []);
    }
  }, [step?.overlays]);

  const onHotspotMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
  };

  const onOverlayMouseDown = (e: React.MouseEvent, overlayId: string) => {
    e.preventDefault();
    e.stopPropagation();
    onSelectOverlay(overlayId);
    draggingOverlayId.current = overlayId;
  };

  const getPct = (e: React.MouseEvent) => {
    if (!screenshotRef.current) return { x: 0, y: 0 };
    const rect = screenshotRef.current.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - rect.left)  / rect.width)  * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - rect.top)   / rect.height) * 100)),
    };
  };

  const onScreenshotMouseDown = (e: React.MouseEvent) => {
    if (activeTool !== 'zoomFocus') return;
    e.preventDefault();
    const { x, y } = getPct(e);
    focusStart.current = { x, y };
    focusDragging.current = true;
    setFocusRect({ x1: x, y1: y, x2: x, y2: y });
  };

  const onScreenshotMouseMove = (e: React.MouseEvent) => {
    if (focusDragging.current && focusStart.current) {
      const { x, y } = getPct(e);
      setFocusRect({ x1: focusStart.current.x, y1: focusStart.current.y, x2: x, y2: y });
      return;
    }
    if (draggingOverlayId.current) {
      const { x, y } = getPct(e);
      setLocalOverlays((prev) =>
        prev.map((o) => (o.id === draggingOverlayId.current ? { ...o, pctX: x, pctY: y } : o))
      );
      return;
    }
    if (!dragging.current) return;
    const { x, y } = getPct(e);
    dragPos.current = { x, y };
    setPos({ x, y });
  };

  const onScreenshotMouseUp = (_e: React.MouseEvent) => {
    if (focusDragging.current && focusRect) {
      focusDragging.current = false;
      const x1 = Math.min(focusRect.x1, focusRect.x2);
      const y1 = Math.min(focusRect.y1, focusRect.y2);
      const x2 = Math.max(focusRect.x1, focusRect.x2);
      const y2 = Math.max(focusRect.y1, focusRect.y2);
      const w = x2 - x1;
      const h = y2 - y1;
      if (w > 3 && h > 3) {
        const centerX   = (x1 + x2) / 2;
        const centerY   = (y1 + y2) / 2;
        const zoomScale = Math.min(5, Math.max(1.1, Math.min(100 / w, 100 / h)));
        onUpdateHotspot(centerX, centerY, undefined, zoomScale);
      }
      setFocusRect(null);
      onClearTool();
      return;
    }
    if (draggingOverlayId.current) {
      const targetId = draggingOverlayId.current;
      draggingOverlayId.current = null;
      const finalOverlay = localOverlays.find((o) => o.id === targetId);
      if (finalOverlay && onUpdateOverlay) {
        onUpdateOverlay({ pctX: finalOverlay.pctX, pctY: finalOverlay.pctY }, targetId);
      }
      return;
    }
    if (!dragging.current) return;
    dragging.current = false;
    onUpdateHotspot(dragPos.current.x, dragPos.current.y);
  };

  const cards: DemoCard[] = step?.cards ?? [];
  const blurCards    = cards.filter((c) => c.type === 'blur'    && c.rect);
  const calloutCards = cards.filter((c) => c.type === 'callout' && c.rect);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: zn.bg, position: 'relative' }}>
      <DotGrid className="!fixed" glowRadius={RenderConstants.GLOW_RADIUS} />
      {/* Floating hint chip when a tool is active */}
      {activeTool && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
          display: 'inline-flex', alignItems: 'center', gap: 7,
          height: 26, padding: '0 10px', borderRadius: 7,
          background: withAlpha(brand, 0.14), border: `1px solid ${withAlpha(brand, 0.4)}`,
          color: brand, fontSize: 12, fontWeight: 500, boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
          pointerEvents: 'none',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: brand, boxShadow: `0 0 0 4px ${withAlpha(brand, 0.25)}` }} />
          {OVERLAY_HINTS[activeTool]}
        </div>
      )}
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '34px 40px', minHeight: 0, position: 'relative', zIndex: 10 }}>
        <div style={{ width: '100%', maxWidth: 760, borderRadius: 12, overflow: 'hidden', boxShadow: '0 30px 70px -24px rgba(0,0,0,0.8)', border: `1px solid ${zn.border2}` }}>
          {/* Browser chrome */}
          <div style={{ height: 34, background: zn.panel2, display: 'flex', alignItems: 'center', gap: 7, padding: '0 12px', borderBottom: `1px solid ${zn.border}` }}>
            <span style={{ display: 'flex', gap: 6 }}>
              {['#ff5f57', '#febc2e', '#28c840'].map((c) => <span key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c }} />)}
            </span>
            <div style={{ marginLeft: 10, flex: 1, maxWidth: 320, height: 20, borderRadius: 6, background: zn.panel, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11, color: zn.dim }}>
              <I.Link size={11} /> {step?.url?.replace(/^https?:\/\//, '').substring(0, 40) || 'app.example.com'}
            </div>
          </div>

          {/* Screenshot + overlays */}
          <div
            ref={screenshotRef}
            onMouseDown={onScreenshotMouseDown}
            onMouseMove={onScreenshotMouseMove}
            onMouseUp={(e) => onScreenshotMouseUp(e)}
            onMouseLeave={(e) => onScreenshotMouseUp(e)}
            onClick={(e) => {
              if (!activeTool || activeTool === 'zoomFocus' || !screenshotRef.current) return;
              const rect = screenshotRef.current.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * 100;
              const y = ((e.clientY - rect.top) / rect.height) * 100;
              onPlaceOverlay(x, y);
            }}
            onDoubleClick={(e) => {
              if (activeTool) return;
              if (!screenshotRef.current) return;
              const rect = screenshotRef.current.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * 100;
              const y = ((e.clientY - rect.top) / rect.height) * 100;
              useStudioStore.getState().setActiveTool('hotspot');
              setTimeout(() => {
                onPlaceOverlay(x, y);
              }, 0);
            }}
            style={{ position: 'relative', aspectRatio: '16/9', background: '#fff', userSelect: 'none', cursor: activeTool ? 'crosshair' : 'default' }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'rgba(0,0,0,0.1)', zIndex: 30 }}>
              <div style={{ height: '100%', background: brand }} />
            </div>
            <ScreenshotPlaceholder step={step} session={session} showChrome={false} aspect="16/9" rounded="" mode="stage" className="w-full h-full !shadow-none" />

            {/* Blur overlays */}
            {blurCards.map((card) => (
              <div key={card.id} style={{ position: 'absolute', left: `${card.rect!.x}%`, top: `${card.rect!.y}%`, width: `${card.rect!.w}%`, height: `${card.rect!.h}%`, backdropFilter: 'blur(7px)', WebkitBackdropFilter: 'blur(7px)', background: 'rgba(0,0,0,0.12)', borderRadius: 4, zIndex: 16, border: '1.5px dashed rgba(255,255,255,0.3)', pointerEvents: 'none' }} />
            ))}
            {/* Callout overlays */}
            {calloutCards.map((card) => (
              <div key={card.id} style={{ position: 'absolute', left: `${card.rect!.x}%`, top: `${card.rect!.y}%`, transform: 'translate(-50%, -100%)', zIndex: 18, pointerEvents: 'none' }}>
                <div style={{ background: card.color || brand, color: '#fff', fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 6, whiteSpace: 'nowrap', boxShadow: `0 6px 18px ${withAlpha(card.color || brand, 0.4)}`, position: 'relative' }}>
                  {card.body || 'Callout'}
                  <span style={{ position: 'absolute', left: '50%', bottom: -4, transform: 'translateX(-50%) rotate(45deg)', width: 8, height: 8, background: card.color || brand, borderRadius: 1 }} />
                </div>
              </div>
            ))}

            {/* Overlay layer */}
            {(localOverlays ?? []).map((ov: Overlay) => {
              const selected = ov.id === selectedOverlayId;
              if (ov.type === 'spotlight' && ov.w && ov.h) {
                return (
                  <SpotlightMask
                    key={ov.id}
                    rect={{ x: ov.pctX, y: ov.pctY, w: ov.w, h: ov.h }}
                    shape={ov.shape ?? 'rounded'}
                    overlayOpacity={ov.overlayOpacity ?? 55}
                    borderColor={selected ? brand : (ov.borderColor ?? brand)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectOverlay(ov.id);
                    }}
                    onMouseDown={(e) => onOverlayMouseDown(e, ov.id)}
                  />
                );
              }
              if (ov.type === 'callout') {
                return (
                  <CalloutCard
                    key={ov.id}
                    ov={ov}
                    selected={selected}
                    brand={brand}
                    isEditor
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectOverlay(ov.id);
                    }}
                    onMouseDown={(e) => onOverlayMouseDown(e, ov.id)}
                  />
                );
              }
              return (
                <div key={ov.id}
                  onClick={(e) => { e.stopPropagation(); onSelectOverlay(ov.id); }}
                  onMouseDown={(e) => onOverlayMouseDown(e, ov.id)}
                  style={{ position: 'absolute', left: `${ov.pctX}%`, top: `${ov.pctY}%`, transform: 'translate(-50%,-50%)', zIndex: selected ? 30 : 22, cursor: 'pointer' }}>
                  {ov.type === 'hotspot' && !ov.invisible && (
                    <Hotspot style={hotspotStyle} brand={brand} size={20} handles={selected} />
                  )}
                </div>
              );
            })}

            {/* Draggable hotspot */}
            {coords && (
              <Hotspot
                style={hotspotStyle}
                brand={brand}
                white={hotspotStyle !== 'arrow' && hotspotStyle !== 'ring'}
                x={pos.x}
                y={pos.y}
                size={currentSize}
                handles
                onMouseDown={onHotspotMouseDown}
              />
            )}

            {/* Zoom focus rect while drawing */}
            {focusRect && (() => {
              const x = Math.min(focusRect.x1, focusRect.x2);
              const y = Math.min(focusRect.y1, focusRect.y2);
              const w = Math.abs(focusRect.x2 - focusRect.x1);
              const h = Math.abs(focusRect.y2 - focusRect.y1);
              return (
                <div style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%`, border: `2px solid ${brand}`, borderRadius: 4, background: withAlpha(brand, 0.12), pointerEvents: 'none', zIndex: 30, boxSizing: 'border-box' }} />
              );
            })()}
          </div>

          {/* Hotspot size + zoom controls */}
          {coords && (
            <div style={{ height: 34, background: zn.panel2, borderTop: `1px solid ${zn.border}`, display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px' }}>
              {step?.animationTarget?.zoomScale > 1 && (
                <>
                  <span style={{ fontSize: 10.5, color: zn.dim }}>Zoom {step.animationTarget.zoomScale.toFixed(1)}×</span>
                  <button onClick={() => onUpdateHotspot(dragPos.current.x, dragPos.current.y, undefined, 1)}
                    style={{ height: 22, padding: '0 8px', borderRadius: 5, border: `1px solid ${zn.border}`, background: 'transparent', color: zn.mute, fontSize: 10.5, cursor: 'pointer' }}>
                    Reset
                  </button>
                  <div style={{ width: 1, height: 16, background: zn.border, margin: '0 2px' }} />
                </>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10.5, color: zn.dim }}>Hotspot size</span>
                {HS_SIZES.map(({ label, v }) => (
                  <button key={label} onClick={() => onUpdateHotspot(dragPos.current.x, dragPos.current.y, v)}
                    style={{ width: 26, height: 22, borderRadius: 5, border: `1px solid ${currentSize === v ? brand : zn.border}`, background: currentSize === v ? withAlpha(brand, 0.15) : 'transparent', color: currentSize === v ? brand : zn.dim, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sortable card block ───────────────────────────────────────────────────────

const fieldLabel: React.CSSProperties = { fontSize: 10.5, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: zn.dim, marginBottom: 6, display: 'block' };
const inputStyle: React.CSSProperties = { width: '100%', background: zn.bg, border: `1px solid ${zn.border}`, borderRadius: 8, color: zn.ink, fontSize: 13, padding: '9px 11px', outline: 'none', fontFamily: 'inherit' };

const CARD_ICONS: Record<string, React.FC<any>> = {
  text: I.AlignLeft, cta: I.ArrowRight, blur: I.EyeOff, callout: I.MessageSquare,
  video: I.Video, form: I.ClipboardList, image: I.Image, embed: I.Code2,
};

function SortableCardBlock({ card, brand, onChange, onDelete }: {
  card: DemoCard; brand: string;
  onChange: (id: string, patch: Partial<DemoCard>) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const [open, setOpen] = useState(true);
  const Icon = CARD_ICONS[card.type] || I.AlignLeft;
  const label = card.type.charAt(0).toUpperCase() + card.type.slice(1);

  return (
    <div ref={setNodeRef} style={{ borderRadius: 10, border: `1px solid ${zn.border}`, background: zn.panel, overflow: 'hidden', opacity: isDragging ? 0.5 : 1, transform: CSS.Transform.toString(transform), transition }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 9px', background: zn.panel2, borderBottom: open ? `1px solid ${zn.border}` : 'none' }}>
        <span {...attributes} {...listeners} style={{ color: zn.dim, cursor: 'grab', display: 'flex', touchAction: 'none' }}>
          <I.GripVertical size={15} />
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: brand, background: withAlpha(brand, 0.13), padding: '3px 8px', borderRadius: 6 }}>
          <Icon size={12} /> {label}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
          <button onClick={() => setOpen((v) => !v)} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'transparent', color: zn.dim, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            {open ? <I.ChevronUp size={15} /> : <I.ChevronDown size={15} />}
          </button>
          <button onClick={() => onDelete(card.id)} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'transparent', color: zn.dim, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            <I.Trash2 size={14} />
          </button>
        </span>
      </div>
      {open && (
        <div style={{ padding: 11, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {card.type === 'text' && (
            <textarea
              value={card.body ?? ''}
              onChange={(e) => onChange(card.id, { body: e.target.value })}
              rows={3}
              placeholder="Describe what's happening…"
              style={{ ...inputStyle, lineHeight: 1.5 }}
            />
          )}
          {card.type === 'cta' && (
            <>
              <div>
                <label style={fieldLabel}>Button label</label>
                <input value={card.ctaLabel ?? ''} onChange={(e) => onChange(card.id, { ctaLabel: e.target.value })} placeholder="Get started" style={inputStyle} />
              </div>
              <div>
                <label style={fieldLabel}>URL</label>
                <input value={card.ctaUrl ?? ''} onChange={(e) => onChange(card.id, { ctaUrl: e.target.value })} placeholder="https://…" style={inputStyle} />
              </div>
            </>
          )}
          {card.type === 'callout' && (
            <>
              <div>
                <label style={fieldLabel}>Text</label>
                <input value={card.body ?? ''} onChange={(e) => onChange(card.id, { body: e.target.value })} placeholder="Look here!" style={inputStyle} />
              </div>
              <div>
                <label style={fieldLabel}>Position X% / Y%</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="number" min={0} max={100} value={card.rect?.x ?? 50} onChange={(e) => onChange(card.id, { rect: { ...(card.rect ?? { x: 50, y: 50, w: 20, h: 10 }), x: +e.target.value } })} style={{ ...inputStyle, width: '50%' }} placeholder="X%" />
                  <input type="number" min={0} max={100} value={card.rect?.y ?? 50} onChange={(e) => onChange(card.id, { rect: { ...(card.rect ?? { x: 50, y: 50, w: 20, h: 10 }), y: +e.target.value } })} style={{ ...inputStyle, width: '50%' }} placeholder="Y%" />
                </div>
              </div>
            </>
          )}
          {card.type === 'blur' && (
            <>
              <div style={{ fontSize: 12, color: zn.mute, lineHeight: 1.4 }}>Define the blur region using percent coordinates.</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(['x', 'y', 'w', 'h'] as const).map((k) => (
                  <div key={k}>
                    <label style={fieldLabel}>{k === 'w' ? 'Width %' : k === 'h' ? 'Height %' : k.toUpperCase() + ' %'}</label>
                    <input type="number" min={0} max={100} value={card.rect?.[k] ?? (k === 'x' || k === 'y' ? 30 : 20)} onChange={(e) => onChange(card.id, { rect: { ...(card.rect ?? { x: 30, y: 30, w: 20, h: 10 }), [k]: +e.target.value } })} style={inputStyle} />
                  </div>
                ))}
              </div>
            </>
          )}
          {card.type === 'video' && (
            <div>
              <label style={fieldLabel}>Video URL</label>
              <input value={card.videoUrl ?? ''} onChange={(e) => onChange(card.id, { videoUrl: e.target.value })} placeholder="https://youtube.com/…" style={inputStyle} />
            </div>
          )}
          {card.type === 'form' && (
            <div style={{ fontSize: 12, color: zn.mute }}>Form fields editor — coming soon.</div>
          )}
          {(card.type === 'image' || card.type === 'embed') && (
            <div style={{ fontSize: 12, color: zn.mute }}>{card.type === 'image' ? 'Image upload' : 'Embed URL'} — coming soon.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Content panel ────────────────────────────────────────────────────────────

function ContentPanel({ step, stepIndex, brand, onSave }: {
  step: any; stepIndex: number; brand: string;
  onSave: (updates: { stepTitle?: string | null; textOverride?: string | null; cards?: DemoCard[] }) => void;
}) {
  const [picker, setPicker]   = useState(false);
  const [title,  setTitle]    = useState(step?.stepTitle || '');
  const [body,   setBody]     = useState(displayText(step?.textOverride || step?.generatedText) || '');
  const [cards,  setCards]    = useState<DemoCard[]>(step?.cards ?? []);

  // Sync local state when step changes
  useEffect(() => {
    setTitle(step?.stepTitle || '');
    setBody(displayText(step?.textOverride || step?.generatedText) || '');
    setCards(step?.cards ?? []);
  }, [step?.id]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const saveAll = (overrides?: { cards?: DemoCard[] }) => {
    onSave({ stepTitle: title || null, textOverride: body || null, cards: overrides?.cards ?? cards });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = cards.findIndex((c) => c.id === active.id);
    const newIdx = cards.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(cards, oldIdx, newIdx).map((c, i) => ({ ...c, order: i }));
    setCards(reordered);
    onSave({ stepTitle: title || null, textOverride: body || null, cards: reordered });
  };

  const handleCardChange = (id: string, patch: Partial<DemoCard>) => {
    const updated = cards.map((c) => c.id === id ? { ...c, ...patch } : c);
    setCards(updated);
    // debounce via blur — just update local for now, save on blur via parent
  };

  const handleCardDelete = (id: string) => {
    const updated = cards.filter((c) => c.id !== id).map((c, i) => ({ ...c, order: i }));
    setCards(updated);
    onSave({ stepTitle: title || null, textOverride: body || null, cards: updated });
  };

  const handleAddCard = (type: DemoCard['type']) => {
    const newCard: DemoCard = { id: crypto.randomUUID(), type, order: cards.length };
    if (type === 'blur' || type === 'callout') newCard.rect = { x: 30, y: 30, w: 20, h: 10 };
    if (type === 'form') newCard.formFields = [{ id: crypto.randomUUID(), label: 'Name', type: 'text' }];
    const updated = [...cards, newCard];
    setCards(updated);
    onSave({ stepTitle: title || null, textOverride: body || null, cards: updated });
    setPicker(false);
  };

  // Separate non-text cards to show after text
  const nonTextCards = cards.filter((c) => c.type !== 'text');

  return (
    <div className="dm-scroll" style={{ width: 340, flex: 'none', borderLeft: `1px solid ${zn.border}`, background: zn.bg, padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 11, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: zn.ink }}>Step content</span>
        <span style={{ fontSize: 11, color: zn.dim }}>Step {stepIndex + 1}</span>
      </div>

      {/* Title */}
      <div>
        <label style={fieldLabel}>Step title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => saveAll()}
          placeholder="e.g. Select a project"
          style={{ ...inputStyle, fontWeight: 600, fontSize: 14 }}
        />
      </div>

      {/* Text card (always present, first) */}
      <div style={{ borderRadius: 10, border: `1px solid ${zn.border}`, background: zn.panel, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 9px', background: zn.panel2, borderBottom: `1px solid ${zn.border}` }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: brand, background: withAlpha(brand, 0.13), padding: '3px 8px', borderRadius: 6 }}>
            <I.AlignLeft size={12} /> Text
          </span>
        </div>
        <div style={{ padding: 11 }}>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} onBlur={() => saveAll()} rows={3} placeholder="Describe what's happening…" style={{ ...inputStyle, lineHeight: 1.5 }} />
        </div>
      </div>

      {/* Sortable extra cards */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={nonTextCards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {nonTextCards.map((card) => (
            <SortableCardBlock
              key={card.id}
              card={card}
              brand={brand}
              onChange={(id, patch) => {
                handleCardChange(id, patch);
              }}
              onDelete={handleCardDelete}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* Add card button */}
      <button onClick={() => setPicker((v) => !v)} style={{ height: 38, borderRadius: 9, border: `1.5px dashed ${zn.border2}`, background: 'transparent', color: zn.mute, fontSize: 12.5, fontWeight: 550, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
        <I.Plus size={15} /> Add card
      </button>

      {picker && (
        <div style={{ position: 'absolute', left: 14, right: 14, bottom: 14, zIndex: 50 }}>
          <CardTypePicker brand={brand} onPick={(type) => handleAddCard(type as DemoCard['type'])} onClose={() => setPicker(false)} embedded />
        </div>
      )}
    </div>
  );
}

// ─── Bottom bar ───────────────────────────────────────────────────────────────

function EndScreenEditor({ brand }: { brand: string }) {
  const session = useStudioStore((s) => s.session);
  const saveEndScreen = useStudioStore((s) => s.saveEndScreen);
  const es = (session?.metadata as any)?.endScreen ?? {};
  const [fields, setFields] = useState({ headline: es.headline ?? '', subheadline: es.subheadline ?? '', ctaLabel: es.ctaLabel ?? '', ctaUrl: es.ctaUrl ?? '' });
  const save = (patch: Partial<typeof fields>) => {
    const updated = { ...fields, ...patch };
    setFields(updated);
    saveEndScreen(Object.values(updated).some(Boolean) ? updated : null);
  };
  return (
    <div className="dm-scroll" style={{ width: 340, flex: 'none', borderLeft: `1px solid ${zn.border}`, background: zn.bg, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 13 }}>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: zn.ink }}>End screen</span>
      {([['headline', 'Headline', "That's a wrap!"], ['subheadline', 'Subheadline', 'You just saw the whole flow.'], ['ctaLabel', 'CTA button label', 'Book a demo'], ['ctaUrl', 'CTA URL', 'https://…']] as const).map(([key, label, ph]) => (
        <div key={key}>
          <label style={fieldLabel}>{label}</label>
          <input value={(fields as any)[key]} onChange={(e) => save({ [key]: e.target.value })}
            placeholder={ph} style={inputStyle} />
        </div>
      ))}
      <div style={{ padding: 12, borderRadius: 10, background: zn.panel2, border: `1px solid ${zn.border}` }}>
        <div style={{ fontSize: 11, color: zn.dim, marginBottom: 4 }}>Preview</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: zn.ink }}>{fields.headline || "That's a wrap!"}</div>
        <div style={{ fontSize: 12, color: zn.mute, marginTop: 4 }}>{fields.subheadline || 'You just saw the whole flow.'}</div>
        {fields.ctaLabel && <div style={{ marginTop: 10, display: 'inline-block', padding: '7px 14px', borderRadius: 8, background: brand, color: '#fff', fontSize: 12, fontWeight: 600 }}>{fields.ctaLabel}</div>}
      </div>
    </div>
  );
}

function BottomBar({ current, total, brand, onPrev, onNext, onStylePicker, transitionStyle, onTransitionChange }: {
  current: number; total: number; brand: string;
  onPrev: () => void; onNext: () => void; onStylePicker: () => void;
  transitionStyle: 'cut' | 'crossfade'; onTransitionChange: (s: 'cut' | 'crossfade') => void;
}) {
  return (
    <div style={{ height: 46, flex: 'none', borderTop: `1px solid ${zn.border}`, background: zn.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '0 16px', position: 'relative' }}>
      <div style={{ position: 'absolute', left: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={onStylePicker} title="Hotspot style"
          style={{ height: 28, padding: '0 10px', borderRadius: 7, border: `1px solid ${zn.border}`, background: 'transparent', color: zn.mute, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
          <I.Cursor size={13} /> Hotspot style
        </button>
        {/* Transition style picker */}
        <div style={{ display: 'flex', alignItems: 'center', background: zn.panel2, borderRadius: 7, border: `1px solid ${zn.border}`, padding: 2, gap: 2 }}>
          {(['cut', 'crossfade'] as const).map((s) => (
            <button
              key={s}
              onClick={() => onTransitionChange(s)}
              title={s === 'cut' ? 'Instant cut between steps' : 'Crossfade between steps'}
              style={{
                height: 22, padding: '0 9px', borderRadius: 5, border: 'none', cursor: 'pointer',
                background: transitionStyle === s ? brand : 'transparent',
                color: transitionStyle === s ? '#fff' : zn.mute,
                fontSize: 11, fontWeight: 600, transition: 'all 0.12s',
              }}
            >
              {s === 'cut' ? 'Cut' : 'Fade'}
            </button>
          ))}
        </div>
      </div>
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
  const session             = useStudioStore((s) => s.session);
  const brandState          = useStudioStore((s) => s.brand);
  const saveStep            = useStudioStore((s) => s.saveStep);
  const updateStep          = useStudioStore((s) => s.updateStep);
  const saveAnimationTarget  = useStudioStore((s) => s.saveAnimationTarget);
  const saveTransitionStyle  = useStudioStore((s) => s.saveTransitionStyle);
  const brand               = brandState.primaryColor || '#6366f1';

  const savedAutoplay = (session?.metadata as any)?.autoplay?.enabled ?? false;

  const [current,            setCurrent]           = useState(0);
  const [hotspotStyle,       setHotspotStyle]      = useState<HotspotStyle>('pulse');
  const [showHsPicker,       setShowHsPicker]      = useState(false);

  const activeToolState = useStudioStore((s) => s.activeTool);
  const setActiveToolState = useStudioStore((s) => s.setActiveTool);
  const activeTool = (activeToolState === 'cursor' || !['hotspot', 'callout', 'spotlight', 'zoomFocus'].includes(activeToolState))
    ? null
    : activeToolState as OverlayTool;
  const setActiveTool = (t: OverlayTool | null) => {
    setActiveToolState(t || 'cursor');
  };

  const showPreview = useStudioStore((s) => s.showDemoPreview);
  const setShowPreview = useStudioStore((s) => s.setShowDemoPreview);

  const [selectedOverlayId,  setSelectedOverlayId] = useState<string | null>(null);
  const [selectedChapterId,  setSelectedChapterId] = useState<string | null>(null);

  const steps = session?.steps ?? [];
  const step  = steps[current];
  const total = steps.length;

  const autoplayInterval  = (session?.metadata as any)?.autoplay?.intervalSeconds ?? 5;
  const transitionStyle   = ((session?.metadata as any)?.transitionStyle ?? 'crossfade') as 'cut' | 'crossfade';
  useEffect(() => {
    if (!savedAutoplay || total === 0) return;
    const t = setInterval(() => setCurrent((c) => (c + 1) % total), autoplayInterval * 1000);
    return () => clearInterval(t);
  }, [savedAutoplay, total, autoplayInterval]);

  if (!session) return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', background: zn.bg, color: zn.dim, fontSize: 13 }}>
      No steps yet
    </div>
  );

  // End screen editor view
  if (current === steps.length) return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: zn.bg, color: zn.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <StepRail current={current} setCurrent={setCurrent} brand={brand} session={session} selectedChapterId={selectedChapterId} onSelectChapter={setSelectedChapterId} />
        <div style={{ flex: 1, background: 'transparent', display: 'grid', placeItems: 'center', position: 'relative' }} >
          <DotGrid className="!fixed" glowRadius={RenderConstants.GLOW_RADIUS} />
          <div style={{ textAlign: 'center', color: zn.dim, fontSize: 13, position: 'relative', zIndex: 10 }}>
            <I.Check size={28} color={brand} style={{ marginBottom: 8 }} />
            <div>End screen preview in the viewer</div>
          </div>
        </div>
        <EndScreenEditor brand={brand} />
      </div>
      <BottomBar current={current} total={total} brand={brand} onPrev={() => setCurrent((c) => Math.max(0, c - 1))} onNext={() => setCurrent((c) => Math.min(steps.length, c + 1))} onStylePicker={() => setShowHsPicker(true)} transitionStyle={transitionStyle} onTransitionChange={saveTransitionStyle} />
    </div>
  );

  if (!step) return null;

  const handleSave = async (updates: { stepTitle?: string | null; textOverride?: string | null; cards?: DemoCard[] }) => {
    updateStep(step.id, updates as any);
    await saveStep(step.id, {
      textOverride: updates.textOverride ?? undefined,
      cards: updates.cards,
      stepTitle: updates.stepTitle,
    });
  };

  const handleUpdateHotspot = async (pctX: number, pctY: number, hotspotSize?: number, zoomScale?: number) => {
    const existing = step?.animationTarget ?? { zoomScale: 1 };
    const updated  = {
      ...existing, pctX, pctY,
      ...(hotspotSize  !== undefined ? { hotspotSize }  : {}),
      ...(zoomScale    !== undefined ? { zoomScale }    : {}),
    };
    updateStep(step.id, { animationTarget: updated });
    await saveAnimationTarget(step.id, updated);
  };

  const currentOverlays: Overlay[] = (step as any).overlays ?? [];
  const selectedOverlay = currentOverlays.find((o) => o.id === selectedOverlayId) ?? null;

  const saveOverlays = async (overlays: Overlay[]) => {
    updateStep(step.id, { overlays } as any);
    await saveStep(step.id, { overlays });
  };

  const handlePlaceOverlay = (pctX: number, pctY: number) => {
    if (!activeTool || activeTool === 'zoomFocus') return;
    const id = crypto.randomUUID();
    const base: Overlay = { id, type: activeTool, pctX, pctY };
    if (activeTool === 'spotlight') { base.w = 25; base.h = 20; base.shape = 'rounded'; base.overlayOpacity = 55; }
    const updated = [...currentOverlays, base];
    saveOverlays(updated);
    setSelectedOverlayId(id);
    setActiveTool(null);
  };

  const handleOverlayUpdate = (patch: Partial<Overlay>, overlayId?: string) => {
    const targetId = overlayId || selectedOverlayId;
    if (!targetId) return;
    const updated = currentOverlays.map((o) => o.id === targetId ? { ...o, ...patch } : o);
    saveOverlays(updated);
  };

  const handleOverlayDelete = () => {
    const updated = currentOverlays.filter((o) => o.id !== selectedOverlayId);
    saveOverlays(updated);
    setSelectedOverlayId(null);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: zn.bg, color: zn.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }} onClick={() => setSelectedOverlayId(null)}>
          <StepRail current={current} setCurrent={setCurrent} brand={brand} session={session} selectedChapterId={selectedChapterId} onSelectChapter={setSelectedChapterId} />
          <BrowserMock step={step} session={session} brand={brand} hotspotStyle={hotspotStyle} onUpdateHotspot={handleUpdateHotspot} activeTool={activeTool} onPlaceOverlay={handlePlaceOverlay} onClearTool={() => setActiveTool(null)} selectedOverlayId={selectedOverlayId} onSelectOverlay={setSelectedOverlayId} onUpdateOverlay={handleOverlayUpdate} />
          <AnimatePresence mode="wait">
            {selectedChapterId ? (
              <motion.div key={`chapter-${selectedChapterId}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <ChapterEditor afterStepId={selectedChapterId} session={session} brand={brand} onClose={() => setSelectedChapterId(null)} />
              </motion.div>
            ) : selectedOverlay ? (
              <motion.div
                key="overlay-sidebar"
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
              >
                <OverlaySidebar overlay={selectedOverlay as any} onUpdate={handleOverlayUpdate as any} onDelete={handleOverlayDelete} onTypeChange={(t) => handleOverlayUpdate({ type: t })} brand={brand} />
              </motion.div>
            ) : (
              <motion.div
                key="content-panel"
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
              >
                <ContentPanel step={step} stepIndex={current} brand={brand} onSave={handleSave} />
              </motion.div>
            )}
          </AnimatePresence>

          {showHsPicker && (
            <div style={{ position: 'absolute', bottom: 60, right: 360, zIndex: 60 }}>
              <HotspotStylePicker brand={brand} selected={hotspotStyle} onPick={(s) => { setHotspotStyle(s); setShowHsPicker(false); }} onClose={() => setShowHsPicker(false)} />
            </div>
          )}
        </div>
      </div>
      <BottomBar current={current} total={total} brand={brand} onPrev={() => setCurrent((c) => Math.max(0, c - 1))} onNext={() => setCurrent((c) => Math.min(total - 1, c + 1))} onStylePicker={() => setShowHsPicker(true)} transitionStyle={transitionStyle} onTransitionChange={saveTransitionStyle} />

      {/* Preview modal */}
      {showPreview && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 44, flex: 'none', background: '#0a0a0b', borderBottom: '1px solid #27272a', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e4e4e7' }}>Preview — viewer experience</span>
            <div style={{ marginLeft: 'auto' }}>
              <button onClick={() => setShowPreview(false)} style={{ height: 30, padding: '0 14px', borderRadius: 7, border: '1px solid #3f3f46', background: 'transparent', color: '#a1a1aa', fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <I.X size={14} /> Close preview
              </button>
            </div>
          </div>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <EmbedDemoView />
          </div>
        </div>
      )}
    </div>
  );
};
