import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { cn, Button, Avatar } from '../ui';
import { NotificationBell } from '../ui/NotificationBell';
import { I } from '../icons';
import { useStudioStore } from '../../store/useStudioStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Crosshair, MessageSquare, Scan, ZoomIn as ZoomInIcon } from '../demo/icons';
import { withAlpha } from '../demo/helpers';
import { apiClient } from '../../lib/apiClient';

export interface StudioHeaderProps {
  activeView: 'sop' | 'video' | 'demo';
  setActiveView: (view: 'sop' | 'video' | 'demo') => void;
  renderMode: 'hybrid' | 'slideshow';
  setRenderMode: (mode: 'hybrid' | 'slideshow') => void;
  onNavigateHome: () => void;
  onShareClick?: () => void;
  onSandboxExport?: () => void;
  onOpenInDocs?: () => void;
  isOpeningInDocs?: boolean;
  onSaveAsTemplate?: (data: { title: string; description: string; category: string; isGlobal: boolean }) => Promise<void>;
}

const zn = {
  bg: '#09090b', panel: '#161618', panel2: '#1c1c1f',
  border: '#27272a', border2: '#323237',
  ink: '#e4e4e7', mute: '#a1a1aa', dim: '#71717a', chip: '#252528',
};

const BG_PRESETS: { label: string; type: 'color' | 'gradient'; value: string }[] = [
  { label: 'Default', type: 'gradient', value: 'default' },
  { label: 'Midnight', type: 'color',   value: '#08080a' },
  { label: 'Slate',    type: 'color',   value: '#0f172a' },
  { label: 'Zinc',     type: 'color',   value: '#18181b' },
  { label: 'Forest',   type: 'gradient', value: 'radial-gradient(120% 80% at 50% -10%, rgba(20,83,45,0.28) 0%, rgba(10,10,11,0) 55%), #08080a' },
  { label: 'Violet',   type: 'gradient', value: 'radial-gradient(120% 80% at 50% -10%, rgba(109,40,217,0.28) 0%, rgba(10,10,11,0) 55%), #08080a' },
  { label: 'Ocean',    type: 'gradient', value: 'radial-gradient(120% 80% at 50% -10%, rgba(7,89,133,0.3) 0%, rgba(10,10,11,0) 55%), #08080a' },
];

const FONTS = ['Inter', 'DM Sans', 'Lato', 'Geist', 'System'];

type OverlayTool = 'hotspot' | 'callout' | 'spotlight' | 'zoomFocus';

const OVERLAY_TOOLS = [
  { id: 'hotspot',    label: 'Hotspot',   Icon: Crosshair },
  { id: 'callout',   label: 'Callout',   Icon: MessageSquare },
  { id: 'spotlight', label: 'Spotlight', Icon: Scan },
  { id: 'zoomFocus', label: 'Focus',     Icon: ZoomInIcon },
] as const;

async function uploadLogo(session: any, file: File): Promise<string | null> {
  const sessionId = session?.id || session?.sessionId;
  const workspaceId = session?.workspaceId;
  if (!sessionId || !workspaceId) return null;
  try {
    const ext = file.name.split('.').pop() ?? 'png';
    const key = `${sessionId}/logo-${Date.now()}.${ext}`;
    const presign = await apiClient.request<{ files: { key: string; uploadUrl: string }[] }>('/assets/upload/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-workspace-id': workspaceId },
      body: JSON.stringify({ sessionId, files: [{ key, contentType: file.type }] }),
    });
    const { uploadUrl } = presign.files[0];
    await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
    return uploadUrl.split('?')[0];
  } catch { return null; }
}

function BrandingPopover({ brand }: { brand: string }) {
  const session = useStudioStore((s) => s.session);
  const saveDemoBackground = useStudioStore((s) => s.saveDemoBackground);
  const saveDemoBrand = useStudioStore((s) => s.saveDemoBrand);
  const savePassword = useStudioStore((s) => s.savePassword);
  const meta = (session?.metadata as any) ?? {};
  const demoBrand = meta.demoBrand ?? {};
  const [tab, setTab] = useState<'bg' | 'brand' | 'settings'>('bg');
  const [uploading, setUploading] = useState(false);
  const currentValue = meta.demoBackground?.value ?? 'default';

  const tabBtn = (id: typeof tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      style={{ flex: 1, height: 26, borderRadius: 6, border: 'none', background: tab === id ? zn.panel2 : 'transparent', color: tab === id ? zn.ink : zn.dim, fontSize: 12, fontWeight: tab === id ? 600 : 400, cursor: 'pointer' }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, width: 280, background: '#161618', border: `1px solid ${zn.border}`, borderRadius: 12, boxShadow: '0 20px 50px rgba(0,0,0,0.6)', zIndex: 80, padding: 14 }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, background: zn.bg, borderRadius: 8, padding: 3, marginBottom: 14 }}>
        {tabBtn('bg', 'Background')}
        {tabBtn('brand', 'Brand')}
        {tabBtn('settings', 'Settings')}
      </div>

      {tab === 'bg' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {BG_PRESETS.map((p) => {
              const active = currentValue === p.value;
              const swatch = p.type === 'color' ? p.value : (p.value === 'default' ? `radial-gradient(circle at 50% 0%, ${withAlpha(brand, 0.3)} 0%, #08080a 60%)` : p.value);
              return (
                <button
                  key={p.value}
                  title={p.label}
                  type="button"
                  onClick={() => {
                    if (p.value === 'default') saveDemoBackground(null);
                    else saveDemoBackground({ type: p.type, value: p.value });
                  }}
                  style={{ aspectRatio: '3/2', borderRadius: 7, border: `2px solid ${active ? brand : 'transparent'}`, background: swatch, cursor: 'pointer', outline: 'none' }}
                />
              );
            })}
          </div>
          <div style={{ marginTop: 10, borderTop: `1px solid ${zn.border}`, paddingTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="color"
              defaultValue={meta.demoBackground?.type === 'color' ? meta.demoBackground.value : '#08080a'}
              onChange={(e) => saveDemoBackground({ type: 'color', value: e.target.value })}
              style={{ width: 34, height: 28, borderRadius: 6, border: `1px solid ${zn.border}`, padding: 2, background: 'transparent', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 11.5, color: zn.mute }}>Custom color</span>
          </div>
        </>
      )}

      {tab === 'brand' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Logo */}
          <div>
            <div style={{ fontSize: 11, color: zn.dim, marginBottom: 6 }}>Logo</div>
            {demoBrand.logoUrl && <img src={demoBrand.logoUrl} alt="logo" style={{ height: 32, borderRadius: 6, marginBottom: 8, objectFit: 'contain', background: '#fff', padding: '2px 6px' }} />}
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, height: 30, padding: '0 10px', borderRadius: 7, border: `1px solid ${zn.border}`, background: zn.panel2, color: uploading ? zn.dim : zn.ink, fontSize: 12, cursor: uploading ? 'default' : 'pointer' }}>
              <I.Upload size={13} /> {uploading ? 'Uploading…' : 'Upload logo'}
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                disabled={uploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  setUploading(true);
                  const url = await uploadLogo(session, file);
                  if (url) saveDemoBrand({ logoUrl: url });
                  setUploading(false);
                }}
              />
            </label>
            {demoBrand.logoUrl && (
              <button
                type="button"
                onClick={() => saveDemoBrand({ logoUrl: null })}
                style={{ marginTop: 4, fontSize: 11, color: zn.dim, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Remove logo
              </button>
            )}
          </div>
          {/* Font */}
          <div>
            <div style={{ fontSize: 11, color: zn.dim, marginBottom: 6 }}>Font</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {FONTS.map((f) => {
                const active = (demoBrand.fontFamily ?? 'Inter') === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => saveDemoBrand({ fontFamily: f })}
                    style={{ height: 26, padding: '0 10px', borderRadius: 6, border: `1px solid ${active ? brand : zn.border}`, background: active ? withAlpha(brand, 0.12) : 'transparent', color: active ? brand : zn.mute, fontSize: 12, cursor: 'pointer' }}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Watermark */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: zn.ink }}>Show watermark</span>
            <div
              onClick={() => saveDemoBrand({ watermark: !(demoBrand.watermark ?? true) })}
              style={{ width: 34, height: 19, borderRadius: 99, background: (demoBrand.watermark ?? true) ? brand : zn.border2, position: 'relative', cursor: 'pointer', transition: 'background 0.18s' }}
            >
              <span style={{ position: 'absolute', top: 2, left: (demoBrand.watermark ?? true) ? 17 : 2, width: 15, height: 15, borderRadius: '50%', background: '#fff', transition: 'left 0.18s', boxShadow: '0 1px 2px rgba(0,0,0,0.4)' }} />
            </div>
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Password */}
          <div>
            <div style={{ fontSize: 11, color: zn.dim, marginBottom: 6 }}>Password protection</div>
            <input
              defaultValue={meta.password ?? ''}
              placeholder="Leave blank for no gate"
              onBlur={(e) => savePassword(e.target.value.trim() || null)}
              style={{ width: '100%', background: zn.bg, border: `1px solid ${zn.border}`, borderRadius: 7, color: zn.ink, fontSize: 12.5, padding: '8px 10px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            {meta.password && <div style={{ marginTop: 4, fontSize: 10.5, color: zn.dim }}>Share link with <code style={{ background: zn.panel2, padding: '1px 4px', borderRadius: 3 }}>?pw={meta.password}</code> to bypass</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  activeView,
  setActiveView,
  renderMode,
  setRenderMode,
  onNavigateHome: _onNavigateHome,
  onShareClick,
  onSandboxExport,
  onOpenInDocs,
  isOpeningInDocs,
  onSaveAsTemplate,
}) => {
  const [showBranding, setShowBranding] = useState(false);
  const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false);
  const [templateForm, setTemplateForm] = useState({ title: '', description: '', category: 'feature-walkthrough', isGlobal: false });
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [showSessionMenu, setShowSessionMenu] = useState(false);

  const session = useStudioStore((s) => s.session);
  const brand = useStudioStore((s) => s.brand);
  const saveAutoplay = useStudioStore((s) => s.saveAutoplay);
  const setShowDemoPreview = useStudioStore((s) => s.setShowDemoPreview);
  const saveSessionTitle = useStudioStore((s) => s.saveSessionTitle);
  const publishedAt = useStudioStore((s) => s.publishedAt);
  const lastPublishedMs = useStudioStore((s) => s.lastPublishedMs);
  const [publishedRecently, setPublishedRecently] = useState(false);

  React.useEffect(() => {
    if (!lastPublishedMs) return;
    setPublishedRecently(true);
    const t = setTimeout(() => setPublishedRecently(false), 5000);
    return () => clearTimeout(t);
  }, [lastPublishedMs]);

  const [editingTitle, setEditingTitle] = useState(session?.aiOutputs?.title || 'Untitled Session');

  // Keep state in sync with external session updates
  React.useEffect(() => {
    if (session?.aiOutputs?.title) {
      setEditingTitle(session.aiOutputs.title);
    }
  }, [session?.aiOutputs?.title]);

  const activeToolState = useStudioStore((s) => s.activeTool);
  const setActiveToolState = useStudioStore((s) => s.setActiveTool);
  const activeTool = (activeToolState === 'cursor' || !['hotspot', 'callout', 'spotlight', 'zoomFocus'].includes(activeToolState))
    ? null
    : activeToolState as OverlayTool;
  const setActiveTool = (t: string) => {
    setActiveToolState(t);
  };

  const brandColor = brand.primaryColor || '#6366f1';
  const savedAutoplay = (session?.metadata as any)?.autoplay?.enabled ?? false;
  const autoplayInterval = (session?.metadata as any)?.autoplay?.intervalSeconds ?? 5;

  return (
    <header
      className="h-14 bg-surface border-b border-border flex items-center px-2 sm:px-4 gap-1.5 sm:gap-3 z-40 relative min-w-0"
      onClick={() => setShowBranding(false)}
    >
      {/* Left zone: Session Breadcrumb */}
      <div className="flex items-center gap-1.5 shrink-0 select-none">
        <div className="flex flex-col shrink-0 pr-1">
          <input
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            onBlur={() => {
              if (editingTitle.trim() && editingTitle !== session?.aiOutputs?.title) {
                saveSessionTitle(editingTitle.trim());
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            className="text-[13px] font-semibold text-text bg-transparent border-none outline-none focus:bg-surface-3 focus:ring-1 focus:ring-border rounded px-1.5 py-0.5 -mx-1.5 max-w-[160px] sm:max-w-[240px] transition-all"
          />
          <span className="text-[10px] text-text-3 font-medium capitalize tracking-wide leading-none mt-0.5">
            {activeView} mode
          </span>
        </div>
      </div>

      <div className="w-px h-6 bg-border shrink-0" />

      {/* View switcher */}
      <div className="flex items-center bg-surface-2 rounded-pill p-0.5 relative shrink-0">
        {([
          { id: 'sop', icon: I.FileText, label: 'SOP', fullLabel: 'SOP View' },
          { id: 'video', icon: I.Play, label: 'Video', fullLabel: 'Video Preview' },
          { id: 'demo', icon: I.Presentation, label: 'Demo', fullLabel: 'Demo' },
        ] as const).map(({ id, icon: Icon, label, fullLabel }) => (
          <button
            key={id}
            onClick={() => setActiveView(id)}
            className={cn(
              'relative px-3 h-8 rounded-pill text-[12.5px] font-semibold transition-colors',
              activeView === id ? 'text-text' : 'text-text-2',
            )}
          >
            {activeView === id && (
              <motion.span layoutId="view-bg" className="absolute inset-0 bg-white rounded-pill shadow-sm" />
            )}
            <span className="relative inline-flex items-center gap-1.5">
              <Icon size={14} />
              <span className="hidden md:inline">{fullLabel}</span>
              <span className="md:hidden">{label}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Render mode — only in video view */}
      {activeView === 'video' && (
        <>
          <div className="w-px h-6 bg-border shrink-0" />
          <div className="flex items-center bg-surface-2 rounded-pill p-0.5 relative shrink-0">
            {([
              { id: 'hybrid', icon: I.Video, label: 'Video' },
              { id: 'slideshow', icon: I.Layers, label: 'Slides' },
            ] as const).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setRenderMode(id)}
                className={cn(
                  'relative px-3 h-8 rounded-pill text-[11px] font-bold uppercase tracking-wider transition-colors',
                  renderMode === id ? 'text-text' : 'text-text-2',
                )}
              >
                {renderMode === id && (
                  <motion.span layoutId="mode-bg" className="absolute inset-0 bg-white rounded-pill shadow-sm" />
                )}
                <span className="relative inline-flex items-center gap-1.5">
                  <Icon size={12} />
                  <span className="hidden sm:inline">{label}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Demo View Overlay Tools */}
      {activeView === 'demo' && (
        <>
          <div className="w-px h-6 bg-border shrink-0" />
          <div className="flex items-center bg-surface-2 rounded-pill p-0.5 relative shrink-0">
            {OVERLAY_TOOLS.map(({ id, label, Icon }) => {
              const active = activeTool === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setActiveTool(active ? 'cursor' : id); }}
                  className={cn(
                    'relative px-3 h-8 rounded-pill text-[12.5px] font-semibold transition-colors',
                    active ? 'text-white' : 'text-text-2 hover:text-white',
                  )}
                  style={{
                    backgroundColor: active ? brandColor : 'transparent',
                  }}
                >
                  <span className="relative inline-flex items-center gap-1.5">
                    <Icon size={14} />
                    <span className="hidden lg:inline">{label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Right section */}
      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        {activeView === 'demo' ? (
          <>
            {/* Branding Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowBranding(b => !b); }}
                className="h-8 px-2.5 rounded-pill border border-border text-text hover:bg-surface-2 inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors"
              >
                <I.Palette size={15} />
                <span className="hidden xl:inline">Branding</span>
              </button>
              {showBranding && <BrandingPopover brand={brandColor} />}
            </div>

            {/* Autoplay Toggle */}
            <div
              className="flex items-center gap-2.5 border border-border rounded-pill px-3 h-8 bg-surface-2/40"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  saveAutoplay(!savedAutoplay, autoplayInterval);
                }}
                className="flex items-center gap-2 cursor-pointer select-none"
              >
                <span className="text-[12px] text-text-2 font-semibold hidden xl:inline">Autoplay</span>
                <span
                  className="w-8 h-5 rounded-full relative transition-colors duration-200 bg-zinc-700 shrink-0"
                  style={{ backgroundColor: savedAutoplay ? brandColor : undefined }}
                >
                  <span
                    className="absolute top-[2px] w-4 h-4 rounded-full bg-white transition-all duration-200 shadow-sm"
                    style={{ left: savedAutoplay ? '14px' : '2px' }}
                  />
                </span>
              </button>
              {savedAutoplay && (
                <div className="flex items-center gap-1 border-l border-border pl-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="number"
                    min={2}
                    max={30}
                    value={autoplayInterval}
                    onChange={(e) => {
                      const v = Math.min(30, Math.max(2, Number(e.target.value)));
                      saveAutoplay(savedAutoplay, v);
                    }}
                    className="w-8 h-5 rounded bg-surface border border-border text-text text-[11px] font-semibold text-center outline-none"
                  />
                  <span className="text-[10px] text-text-3">sec</span>
                </div>
              )}
            </div>

            <div className="w-px h-6 bg-border shrink-0" />

            {/* Preview Button */}
            <button
              type="button"
              onClick={() => setShowDemoPreview(true)}
              className="h-8 px-3 rounded-pill bg-primary text-white hover:opacity-90 inline-flex items-center gap-1.5 text-[12.5px] font-semibold shadow-sm transition-all shrink-0"
              style={{ backgroundColor: brandColor }}
            >
              <I.Eye size={14} />
              <span className="hidden lg:inline">Preview</span>
            </button>

            {/* Share Button */}
            <button
              type="button"
              onClick={onShareClick}
              className="h-8 px-3 rounded-pill border border-border text-text hover:bg-surface-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold transition-colors shrink-0"
            >
              <I.Share2 size={14} />
              <span className="hidden lg:inline">Share</span>
            </button>
          </>
        ) : (
          <>
            {/* Collaborator avatars */}
            <div className="flex -space-x-1.5 mr-1 hidden sm:flex">
              <Avatar name="Kartik Upadhyay" size={24} />
              <div className="w-6 h-6 rounded-full border-2 border-white bg-surface-2 flex items-center justify-center text-[10px] font-bold text-text-3">+2</div>
            </div>

            <NotificationBell />

            {activeView === 'sop' && onOpenInDocs && (
              <button
                onClick={onOpenInDocs}
                disabled={isOpeningInDocs}
                className="h-8 px-2.5 rounded-pill inline-flex items-center gap-1.5 border border-border text-text hover:bg-surface-2 transition-colors text-[13px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                title="Export this SOP as a Docs page"
              >
                {isOpeningInDocs ? (
                  <I.Loader size={14} className="animate-spin" />
                ) : (
                  <I.FileText size={14} />
                )}
                <span className="hidden lg:inline">{isOpeningInDocs ? 'Creating…' : 'Open in Docs'}</span>
              </button>
            )}

            {onSandboxExport && (
              <Button variant="ghost" size="sm" icon={I.Download} onClick={onSandboxExport}>
                <span className="hidden sm:inline text-primary">Sandbox Export</span>
              </Button>
            )}

            {(session as any)?.shareToken && (
              <button
                onClick={() => window.open(`/s/${(session as any).shareToken}?preview=1`, '_blank')}
                className="h-8 px-2.5 rounded-pill inline-flex items-center gap-1.5 border border-border text-text hover:bg-surface-2 transition-colors text-[13px] font-medium"
                title="Open share preview in new tab"
              >
                <I.Eye size={14} />
                <span className="hidden lg:inline">Preview</span>
              </button>
            )}

            <AnimatePresence mode="wait">
              {publishedAt && publishedRecently && (
                <motion.span
                  key="live-flash"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-pill bg-[#E5F8EC] text-[#1B7F3B] text-[11.5px] font-semibold shrink-0"
                >
                  <I.CheckCircle size={12} strokeWidth={2.5} />
                  Live — updated at {publishedAt}
                </motion.span>
              )}
              {publishedAt && !publishedRecently && (
                <motion.span
                  key="last-published"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[11px] text-text-3 shrink-0"
                >
                  Last published {publishedAt}
                </motion.span>
              )}
            </AnimatePresence>

            {(() => {
              const sessionUpdatedAt = (session as any)?.updatedAt as number | undefined;
              const hasUnpublishedChanges =
                !!sessionUpdatedAt && !!lastPublishedMs && sessionUpdatedAt > lastPublishedMs;
              return hasUnpublishedChanges ? (
                <span className="inline-flex items-center gap-1 h-6 px-2 rounded-pill bg-yellow-500/10 text-yellow-600 text-[11px] font-semibold shrink-0 border border-yellow-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0" />
                  Unpublished changes
                </span>
              ) : null;
            })()}

            {onSaveAsTemplate && (
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowSessionMenu(m => !m); }}
                  className="h-8 w-8 rounded-pill border border-border text-text hover:bg-surface-2 inline-flex items-center justify-center transition-colors"
                  title="Session options"
                >
                  <I.MoreHorizontal size={15} />
                </button>
                {showSessionMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowSessionMenu(false)} />
                    <div className="absolute right-0 top-10 z-50 w-48 bg-surface border border-border rounded-lg shadow-xl py-1">
                      <button
                        className="w-full text-left px-3 py-2 text-[12.5px] text-text hover:bg-surface-2 transition-colors flex items-center gap-2"
                        onClick={() => {
                          setShowSessionMenu(false);
                          setTemplateForm(f => ({ ...f, title: session?.aiOutputs?.title || '' }));
                          setShowSaveAsTemplate(true);
                        }}
                      >
                        <I.BookmarkPlus size={13} /> Save as template
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            <Button variant="primary" size="sm" icon={I.Share2} onClick={onShareClick}>
              <span className="hidden sm:inline">Share</span>
            </Button>
          </>
        )}

        {/* Save as Template modal */}
        {showSaveAsTemplate && (
          <>
            <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setShowSaveAsTemplate(false)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
              <div className="bg-surface border border-border rounded-xl shadow-2xl w-[400px] p-6 pointer-events-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-[15px] font-semibold text-text">Save as template</h2>
                  <button onClick={() => setShowSaveAsTemplate(false)} className="text-text-3 hover:text-text transition-colors"><I.X size={16} /></button>
                </div>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="text-[12px] font-semibold text-text-2 mb-1.5 block">Title</label>
                    <input
                      value={templateForm.title}
                      onChange={e => setTemplateForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Template title…"
                      className="w-full h-9 px-3 rounded-lg bg-surface-2 border border-border text-[13px] text-text outline-none focus:border-primary transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-semibold text-text-2 mb-1.5 block">Description</label>
                    <textarea
                      value={templateForm.description}
                      onChange={e => setTemplateForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="What is this template for?…"
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-[13px] text-text outline-none focus:border-primary transition-colors resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-semibold text-text-2 mb-1.5 block">Category</label>
                    <select
                      value={templateForm.category}
                      onChange={e => setTemplateForm(f => ({ ...f, category: e.target.value }))}
                      className="w-full h-9 px-3 rounded-lg bg-surface-2 border border-border text-[13px] text-text outline-none focus:border-primary transition-colors"
                    >
                      {[
                        ['feature-walkthrough', 'Feature Walkthrough'],
                        ['client-onboarding', 'Client Onboarding'],
                        ['design-handoff', 'Design Handoff'],
                        ['process-runbook', 'Process Runbook'],
                        ['product-demo', 'Product Demo'],
                        ['quick-howto', 'Quick How-To'],
                      ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={templateForm.isGlobal}
                      onChange={e => setTemplateForm(f => ({ ...f, isGlobal: e.target.checked }))}
                      className="w-4 h-4 accent-primary"
                    />
                    <span className="text-[12.5px] text-text-2">Publish to community gallery</span>
                  </label>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <button
                    onClick={() => setShowSaveAsTemplate(false)}
                    className="h-8 px-4 rounded-lg border border-border text-[12.5px] text-text-2 hover:text-text transition-colors"
                  >Cancel</button>
                  <button
                    disabled={!templateForm.title.trim() || savingTemplate}
                    onClick={async () => {
                      if (!onSaveAsTemplate || !templateForm.title.trim()) return;
                      setSavingTemplate(true);
                      try {
                        await onSaveAsTemplate(templateForm);
                        setShowSaveAsTemplate(false);
                      } finally {
                        setSavingTemplate(false);
                      }
                    }}
                    className="h-8 px-4 rounded-lg bg-primary text-white text-[12.5px] font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-wait"
                  >{savingTemplate ? 'Saving…' : 'Save template'}</button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
};
