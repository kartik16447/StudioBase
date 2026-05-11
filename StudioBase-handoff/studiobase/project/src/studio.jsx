// Studio-domain components: StepCard, ChapterBreak, SessionCard, ShareHeader,
// SummaryCallout, StepStrip (sidebar list of all steps).

const { motion: m_motion, AnimatePresence: m_AP } = window.Motion;

// ─── StepCard ──────────────────────────────────────────────────────────
// The hero unit of the SOP view. Watermark number, screenshot, body copy,
// hover-revealed actions. Springs up on hover.
function StepCard({ step, index, hue = 244, onEdit, onAnnotate, onDelete, focused, onFocus }) {
  const text = step.textOverride || step.generatedText || '';
  return (
    <article
      onClick={onFocus}
      className={cn(
        'group relative bg-surface rounded-card shadow-card p-6 cursor-default',
        'transition-all duration-200 ease-out hover:shadow-card-hover hover:-translate-y-1',
        focused && 'ring-2 ring-primary ring-offset-2 ring-offset-bg',
      )}
    >
      {/* Watermark step number — top-right of card, behind content visually */}
      <div className="absolute top-3 right-6 pointer-events-none">
        <StepNumber n={step.sequence} size="lg" />
      </div>

      {/* Top row: small step badge + action verb chip */}
      <div className="flex items-center gap-2 mb-4 relative z-10">
        <StepNumber n={step.sequence} size="badge" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-3">
          {step.action}
        </span>
        {step.elementText && (
          <span className="text-[12px] text-text-2 truncate">
            <span className="text-text-3">·</span>{' '}
            <span className="font-mono">{step.elementText}</span>
          </span>
        )}
      </div>

      {/* Screenshot */}
      <ScreenshotPlaceholder step={step} hue={hue} className="mb-5" />

      {/* Body text */}
      <p className="text-[16px] leading-[1.65] text-text relative z-10" style={{ textWrap: 'pretty' }}>
        {text}
      </p>

      {/* URL pill */}
      <div className="mt-4 flex items-center gap-3 relative z-10">
        <Badge tone="neutral" size="sm" icon={I.Globe}>
          {(step.url || '').replace(/^https?:\/\//,'').split('/')[0]}
        </Badge>
        {step.textOverride && (
          <Badge tone="primary" size="sm">edited</Badge>
        )}

        {/* Action toolbar — appears on hover */}
        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <Tooltip content="Edit text" side="top">
            <IconButton icon={I.Edit2} label="Edit" onClick={(e) => { e.stopPropagation(); onEdit?.(step); }} />
          </Tooltip>
          <Tooltip content="Annotate screenshot" side="top">
            <IconButton icon={I.Wand} label="Annotate" onClick={(e) => { e.stopPropagation(); onAnnotate?.(step); }} />
          </Tooltip>
          <Tooltip content="Translate this step" side="top">
            <IconButton icon={I.Languages} label="Translate" />
          </Tooltip>
          <Tooltip content="Delete step" side="top">
            <IconButton icon={I.Trash2} label="Delete" onClick={(e) => { e.stopPropagation(); onDelete?.(step); }} />
          </Tooltip>
        </div>
      </div>
    </article>
  );
}

// ─── ChapterBreak ──────────────────────────────────────────────────────
function ChapterBreak({ index, title }) {
  return (
    <m_motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-surface-2 rounded-card py-4 px-6 my-8 border-l-4 border-primary flex items-center gap-4"
    >
      <Badge tone="primary" size="md">Chapter {index}</Badge>
      <h3 className="text-[17px] font-semibold text-text">{title}</h3>
    </m_motion.div>
  );
}

// ─── SummaryCallout ────────────────────────────────────────────────────
function SummaryCallout({ session }) {
  return (
    <GlassPanel className="p-6 border-l-4 border-primary mb-8" style={{ borderTopLeftRadius: 4, borderBottomLeftRadius: 4 }}>
      <div className="flex items-center gap-2 mb-2">
        <I.Sparkles size={14} className="text-primary" strokeWidth={2.2} />
        <span className="text-[10.5px] font-bold tracking-[0.16em] uppercase text-primary">AI summary</span>
      </div>
      <p className="text-[15px] leading-[1.65] text-text-2" style={{ textWrap: 'pretty' }}>
        {session.aiOutputs.summary}
      </p>
      <div className="flex flex-wrap gap-1.5 mt-4">
        {session.aiOutputs.tags?.map(t => (
          <span key={t} className="text-[11px] font-medium text-text-2 bg-surface-2 px-2.5 h-6 inline-flex items-center rounded-pill">
            {t}
          </span>
        ))}
      </div>
    </GlassPanel>
  );
}

// ─── SessionCard (library grid card) ───────────────────────────────────
function SessionCard({ session, onClick }) {
  const hue = session._hue ?? 244;
  return (
    <div
      onClick={onClick}
      className="bg-surface rounded-card shadow-card hover:shadow-card-hover transition-all duration-200 cursor-pointer overflow-hidden group hover:-translate-y-1"
    >
      {/* Thumbnail */}
      <div className="relative">
        <ScreenshotPlaceholder
          hue={hue}
          aspect="16 / 10"
          rounded=""
          url={session.steps?.[0]?.url || 'https://app.example.com'}
        />
        {/* Type chip top-left */}
        <div className="absolute top-3 left-3">
          <Badge tone="glass" size="sm" icon={session.sessionType === 'video' ? I.Play : I.FileText}>
            {session.sessionType === 'video' ? 'Video' : 'SOP'}
          </Badge>
        </div>
        {/* Duration chip top-right */}
        <div className="absolute top-3 right-3">
          <Badge tone="glass" size="sm" icon={I.Clock}>
            {formatDuration(session.metadata.durationMs)}
          </Badge>
        </div>
      </div>

      {/* Body */}
      <div className="p-5">
        <h3 className="text-[15px] font-semibold text-text leading-snug line-clamp-2 mb-2 group-hover:text-primary transition-colors">
          {session.aiOutputs.title}
        </h3>
        <div className="flex items-center gap-2 text-[12px] text-text-2">
          <span className="inline-flex items-center gap-1">
            <I.FileText size={12} strokeWidth={2} />
            {session.metadata.stepCount} steps
          </span>
          <span className="text-text-3">·</span>
          <span>{formatDate(session.capturedAt)}</span>
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <div className="flex -space-x-1.5">
            <Avatar name="Kartik Upadhyay" size={22} hue={244} />
            <Avatar name="Maya Chen" size={22} hue={198} />
            <Avatar name="Diego Ramos" size={22} hue={22} />
          </div>
          <span className="text-[11px] text-text-3 inline-flex items-center gap-1">
            <I.Eye size={12} strokeWidth={2} /> {12 + ((session.sessionId.charCodeAt(6) || 0) % 80)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── NewSessionCard ────────────────────────────────────────────────────
function NewSessionCard({ onClick }) {
  return (
    <div
      onClick={onClick}
      className="grad-border min-h-[280px] cursor-pointer flex items-center justify-center hover:-translate-y-1 transition-transform"
    >
      <div className="flex flex-col items-center text-center p-8">
        <div className="w-14 h-14 rounded-full bg-primary-light flex items-center justify-center mb-4">
          <I.Plus size={22} className="text-primary" strokeWidth={2.4} />
        </div>
        <h3 className="text-[15px] font-semibold text-text mb-1">New session</h3>
        <p className="text-[12.5px] text-text-2 leading-snug max-w-[200px]">
          Start the recorder in your browser to capture a new walkthrough.
        </p>
      </div>
    </div>
  );
}

// ─── ShareHeader ──────────────────────────────────────────────────────
function ShareHeader({ session }) {
  return (
    <header className="sticky top-0 z-40 glass rounded-none">
      <div className="max-w-[1100px] mx-auto px-6 h-14 flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[10px] bg-text text-white flex items-center justify-center font-bold text-[15px]">S</div>
          <div>
            <div className="text-[13.5px] font-semibold text-text leading-tight">{session.aiOutputs.title}</div>
            <div className="text-[11px] text-text-3 leading-tight">studiobase.app · published walkthrough</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[12px] text-text-2">{session.metadata.stepCount} steps · {formatDuration(session.metadata.durationMs)}</span>
          <Button variant="ghost" size="sm" icon={I.Languages}>English</Button>
          <Button variant="ghost" size="sm" icon={I.Copy}>Copy link</Button>
          <Button variant="primary" size="sm" icon={I.Download}>Export PDF</Button>
          <span className="text-[10.5px] text-text-3 pl-3 border-l border-border">
            Powered by <span className="font-semibold text-text-2">StudioBase</span>
          </span>
        </div>
      </div>
    </header>
  );
}

// ─── StepStrip — compact step list (e.g. in collapsed Script panel) ────
function StepStrip({ steps, focusedStepId, onPick }) {
  return (
    <div className="space-y-1">
      {steps.map(s => (
        <button
          key={s.id}
          onClick={() => onPick?.(s.id)}
          className={cn(
            'w-full flex items-start gap-3 p-2.5 rounded-sm text-left transition-colors',
            focusedStepId === s.id ? 'bg-primary-light' : 'hover:bg-surface-2',
          )}
        >
          <StepNumber n={s.sequence} size="badge" />
          <span className={cn(
            'text-[13px] leading-snug line-clamp-2',
            focusedStepId === s.id ? 'text-text font-medium' : 'text-text-2',
          )}>
            {(s.textOverride || s.generatedText || '').slice(0, 90)}
          </span>
        </button>
      ))}
    </div>
  );
}

Object.assign(window, {
  StepCard, ChapterBreak, SummaryCallout, SessionCard, NewSessionCard, ShareHeader, StepStrip,
});
