import React, { useState, useEffect, useRef } from 'react';
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
import { ScreenshotPlaceholder } from '../../../components/ui';
import { Hotspot } from '../../../components/demo/Hotspot';
import type { HotspotStyle } from '../../../components/demo/Hotspot';
import { HotspotStylePicker } from '../../../components/demo/HotspotStylePicker';
import { CardTypePicker } from '../../../components/demo/CardTypePicker';
import { withAlpha } from '../../../components/demo/helpers';
import { displayText } from '../../../lib/textUtils';
import type { DemoCard, Overlay } from '../../../../../shared/types/step';
import { OverlayToolbar } from '../../../components/demo/OverlayToolbar';
import type { OverlayTool } from '../../../components/demo/OverlayToolbar';
import { OverlaySidebar } from '../../../components/demo/OverlaySidebar';
import { SpotlightMask } from '../../../components/demo/SpotlightMask';

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

// ─── Browser mock (screenshot + draggable hotspot) ───────────────────────────

const HS_SIZES = [{ label: 'S', v: 14 }, { label: 'M', v: 20 }, { label: 'L', v: 28 }];

function BrowserMock({ step, session, brand, hotspotStyle, onUpdateHotspot, activeTool, onPlaceOverlay, selectedOverlayId, onSelectOverlay }: {
  step: any; session: any; brand: string; hotspotStyle: HotspotStyle;
  onUpdateHotspot: (pctX: number, pctY: number, hotspotSize?: number) => void;
  activeTool: OverlayTool | null;
  onPlaceOverlay: (pctX: number, pctY: number) => void;
  selectedOverlayId: string | null;
  onSelectOverlay: (id: string | null) => void;
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

  // Sync when step switches
  useEffect(() => {
    const x = step?.animationTarget?.pctX ?? rawX;
    const y = step?.animationTarget?.pctY ?? rawY;
    setPos({ x, y });
    dragPos.current = { x, y };
  }, [step?.id]);

  const onHotspotMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
  };

  const onScreenshotMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current || !screenshotRef.current) return;
    const rect = screenshotRef.current.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left)  / rect.width)  * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top)   / rect.height) * 100));
    dragPos.current = { x, y };
    setPos({ x, y });
  };

  const onScreenshotMouseUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    onUpdateHotspot(dragPos.current.x, dragPos.current.y);
  };

  const cards: DemoCard[] = step?.cards ?? [];
  const blurCards    = cards.filter((c) => c.type === 'blur'    && c.rect);
  const calloutCards = cards.filter((c) => c.type === 'callout' && c.rect);

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
          <div
            ref={screenshotRef}
            onMouseMove={onScreenshotMouseMove}
            onMouseUp={onScreenshotMouseUp}
            onMouseLeave={onScreenshotMouseUp}
            onClick={(e) => {
              if (!activeTool || !screenshotRef.current) return;
              const rect = screenshotRef.current.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * 100;
              const y = ((e.clientY - rect.top) / rect.height) * 100;
              onPlaceOverlay(x, y);
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
            {(step?.overlays ?? []).map((ov: Overlay) => {
              const selected = ov.id === selectedOverlayId;
              if (ov.type === 'spotlight' && ov.w && ov.h) {
                return (
                  <div key={ov.id} onClick={(e) => { e.stopPropagation(); onSelectOverlay(ov.id); }} style={{ position: 'absolute', inset: 0, zIndex: 17, cursor: 'pointer' }}>
                    <SpotlightMask rect={{ x: ov.pctX, y: ov.pctY, w: ov.w, h: ov.h }} shape={ov.shape ?? 'rounded'} overlayOpacity={ov.overlayOpacity ?? 55} borderColor={selected ? brand : (ov.borderColor ?? brand)} />
                  </div>
                );
              }
              return (
                <div key={ov.id} onClick={(e) => { e.stopPropagation(); onSelectOverlay(ov.id); }}
                  style={{ position: 'absolute', left: `${ov.pctX}%`, top: `${ov.pctY}%`, transform: 'translate(-50%,-50%)', zIndex: 22, cursor: 'pointer' }}>
                  {ov.type === 'hotspot' && !ov.invisible && (
                    <Hotspot style={hotspotStyle} brand={brand} size={20} handles={selected} />
                  )}
                  {ov.type === 'callout' && (
                    <div style={{ background: ov.bgColor ?? '#18181b', color: ov.textColor ?? '#e4e4e7', fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 8, whiteSpace: 'nowrap', border: selected ? `2px solid ${brand}` : '1px solid rgba(255,255,255,0.12)', boxShadow: '0 6px 18px rgba(0,0,0,0.5)' }}>
                      {ov.body || 'Callout text'}
                    </div>
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
          </div>

          {/* Hotspot size controls */}
          {coords && (
            <div style={{ height: 34, background: '#1a1a1d', borderTop: `1px solid ${zn.border}`, display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 10.5, color: zn.dim, marginRight: 2 }}>Hotspot size</span>
              {HS_SIZES.map(({ label, v }) => (
                <button key={label} onClick={() => onUpdateHotspot(dragPos.current.x, dragPos.current.y, v)}
                  style={{ width: 26, height: 22, borderRadius: 5, border: `1px solid ${currentSize === v ? brand : zn.border}`, background: currentSize === v ? withAlpha(brand, 0.15) : 'transparent', color: currentSize === v ? brand : zn.dim, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
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
  const session             = useStudioStore((s) => s.session);
  const brandState          = useStudioStore((s) => s.brand);
  const saveStep            = useStudioStore((s) => s.saveStep);
  const updateStep          = useStudioStore((s) => s.updateStep);
  const saveAnimationTarget = useStudioStore((s) => s.saveAnimationTarget);
  const brand               = brandState.primaryColor || '#6366f1';

  const [current,           setCurrent]          = useState(0);
  const [hotspotStyle,      setHotspotStyle]     = useState<HotspotStyle>('pulse');
  const [autoplay,          setAutoplay]         = useState(false);
  const [showHsPicker,      setShowHsPicker]     = useState(false);
  const [activeTool,        setActiveTool]       = useState<OverlayTool | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);

  const steps = session?.steps ?? [];
  const step  = steps[current];
  const total = steps.length;

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

  const handleSave = async (updates: { stepTitle?: string | null; textOverride?: string | null; cards?: DemoCard[] }) => {
    updateStep(step.id, updates as any);
    await saveStep(step.id, {
      textOverride: updates.textOverride ?? undefined,
      cards: updates.cards,
      stepTitle: updates.stepTitle,
    });
  };

  const handleUpdateHotspot = async (pctX: number, pctY: number, hotspotSize?: number) => {
    const existing = step?.animationTarget ?? { zoomScale: 1 };
    const updated  = { ...existing, pctX, pctY, ...(hotspotSize !== undefined ? { hotspotSize } : {}) };
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
    if (!activeTool) return;
    const id = crypto.randomUUID();
    const base: Overlay = { id, type: activeTool, pctX, pctY };
    if (activeTool === 'spotlight') { base.w = 25; base.h = 20; base.shape = 'rounded'; base.overlayOpacity = 55; }
    const updated = [...currentOverlays, base];
    saveOverlays(updated);
    setSelectedOverlayId(id);
    setActiveTool(null);
  };

  const handleOverlayUpdate = (patch: Partial<Overlay>) => {
    if (!selectedOverlayId) return;
    const updated = currentOverlays.map((o) => o.id === selectedOverlayId ? { ...o, ...patch } : o);
    saveOverlays(updated);
  };

  const handleOverlayDelete = () => {
    const updated = currentOverlays.filter((o) => o.id !== selectedOverlayId);
    saveOverlays(updated);
    setSelectedOverlayId(null);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: zn.bg, color: zn.ink, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <TopBar brand={brand} autoplay={autoplay} setAutoplay={setAutoplay} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <OverlayToolbar activeTool={activeTool} onSelectTool={(t) => setActiveTool((prev) => prev === t ? null : t)} onEditScreenshot={() => {}} brand={brand} />
        <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }} onClick={() => setSelectedOverlayId(null)}>
          <StepRail current={current} setCurrent={setCurrent} brand={brand} session={session} />
          <BrowserMock step={step} session={session} brand={brand} hotspotStyle={hotspotStyle} onUpdateHotspot={handleUpdateHotspot} activeTool={activeTool} onPlaceOverlay={handlePlaceOverlay} selectedOverlayId={selectedOverlayId} onSelectOverlay={setSelectedOverlayId} />
          {selectedOverlay ? (
            <OverlaySidebar overlay={selectedOverlay as any} onUpdate={handleOverlayUpdate as any} onDelete={handleOverlayDelete} onTypeChange={(t) => handleOverlayUpdate({ type: t })} brand={brand} />
          ) : (
            <ContentPanel step={step} stepIndex={current} brand={brand} onSave={handleSave} />
          )}

          {showHsPicker && (
            <div style={{ position: 'absolute', bottom: 60, right: 360, zIndex: 60 }}>
              <HotspotStylePicker brand={brand} selected={hotspotStyle} onPick={(s) => { setHotspotStyle(s); setShowHsPicker(false); }} onClose={() => setShowHsPicker(false)} />
            </div>
          )}
        </div>
      </div>
      <BottomBar current={current} total={total} brand={brand} onPrev={() => setCurrent((c) => Math.max(0, c - 1))} onNext={() => setCurrent((c) => Math.min(total - 1, c + 1))} />
    </div>
  );
};
