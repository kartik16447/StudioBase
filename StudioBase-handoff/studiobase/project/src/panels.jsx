// Tab panels rendered inside the left side of StudioPage.
// Active in Phase 2: Script, Brand, Chapters.
// Locked in Phase 3+: AIVoice, Music, Visuals, Zooms, Elements (wrapped in ComingSoon).

const { motion: p_motion, AnimatePresence: p_AP } = window.Motion;
const { useState: pUseState } = React;

// ─── Script panel ──────────────────────────────────────────────────────
// Per-step text editor — list with selectable rows, edit inline.
function ScriptPanel() {
  const { state, setFocusStep } = useStudioStore();
  const session = state.session;
  const [tone, setTone] = pUseState('Friendly & concise');
  const [search, setSearch] = pUseState('');
  const [isGenerating, setIsGenerating] = pUseState(false);
  if (!session) return null;
  const steps = session.steps.filter(s =>
    !search || (s.textOverride || s.generatedText || '').toLowerCase().includes(search.toLowerCase()) ||
    String(s.sequence).includes(search),
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header — search + AI tone */}
      <div className="px-5 pt-4 pb-3 border-b border-border">
        <FieldShell icon={I.Search} className="mb-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search steps"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-text-3"
          />
        </FieldShell>
        <div className="flex items-center justify-between">
          <SectionLabel className="!mb-0">Voiceover tone</SectionLabel>
          <button
            onClick={() => {
              setIsGenerating(true);
              setTimeout(() => setIsGenerating(false), 2800);
            }}
            className="text-[11px] text-primary font-semibold inline-flex items-center gap-1 hover:opacity-80"
          >
            <I.Sparkles size={11} strokeWidth={2.4} /> Regenerate all
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {['Friendly & concise', 'Formal', 'Technical', 'Marketing', 'Casual'].map(t => (
            <button
              key={t}
              onClick={() => setTone(t)}
              className={cn(
                'text-[11.5px] h-7 px-2.5 rounded-pill border transition-all',
                tone === t
                  ? 'bg-primary text-white border-primary'
                  : 'bg-surface-2 border-transparent text-text-2 hover:bg-[#E6E6EC]',
              )}
            >{t}</button>
          ))}
        </div>
      </div>

      {/* Step list — wrapped in AIShimmer for processing state */}
      <AIShimmer isActive={isGenerating} className="flex-1 min-h-0">
        <div className="h-full scroll-y px-3 py-3 space-y-1.5">
          {steps.map(step => (
            <ScriptStepRow key={step.id} step={step} active={state.focusedStepId === step.id} onClick={() => setFocusStep(step.id)} />
          ))}
          {steps.length === 0 && (
            <div className="text-center text-text-3 text-sm py-12">No steps match your search.</div>
          )}
        </div>
      </AIShimmer>

      {/* Footer — bulk actions */}
      <div className="px-5 py-3 border-t border-border flex items-center justify-between">
        <span className="text-[12px] text-text-2">{steps.length} of {session.steps.length} steps</span>
        <Button variant="ghost" size="sm" icon={I.Languages}>Translate</Button>
      </div>
    </div>
  );
}

function ScriptStepRow({ step, active, onClick }) {
  const text = step.textOverride || step.generatedText || '';
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-sm p-3 cursor-pointer transition-all border',
        active ? 'bg-primary-light border-primary/30' : 'bg-transparent border-transparent hover:bg-surface-2',
      )}
    >
      <div className="flex items-start gap-3">
        <StepNumber n={step.sequence} size="badge" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10.5px] font-bold tracking-wider uppercase text-text-3">{step.action}</span>
            {step.elementText && (
              <span className="text-[11px] text-text-2 font-mono truncate">· {step.elementText}</span>
            )}
            {step.textOverride && <Badge tone="primary" size="sm" className="ml-auto">edited</Badge>}
          </div>
          <p className="text-[13px] text-text leading-snug line-clamp-3" style={{ textWrap: 'pretty' }}>{text}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Brand panel ───────────────────────────────────────────────────────
function BrandPanel() {
  const [primaryColor, setPrimaryColor] = pUseState('#5E5CE6');
  const [font, setFont] = pUseState('SF Pro');
  const [showIntro, setShowIntro] = pUseState(true);
  const [showOutro, setShowOutro] = pUseState(false);
  const [watermark, setWatermark] = pUseState('StudioBase');
  const swatches = ['#5E5CE6', '#0A84FF', '#30D158', '#FF9F0A', '#FF453A', '#BF5AF2', '#FF375F', '#1D1D1F'];
  const fonts = ['SF Pro', 'Inter', 'Geist', 'Söhne', 'Söhne Mono', 'Helvetica Neue'];

  return (
    <div className="h-full scroll-y px-5 py-5 space-y-7">

      {/* Logo */}
      <section>
        <SectionLabel hint="PNG or SVG, up to 2 MB">Workspace logo</SectionLabel>
        <div className="grad-border h-24 flex items-center justify-center">
          <div className="text-center">
            <I.Upload size={20} className="text-primary mx-auto mb-1" strokeWidth={2} />
            <div className="text-[12.5px] font-medium text-text">Drop your logo</div>
            <div className="text-[11px] text-text-3">or click to browse</div>
          </div>
        </div>
      </section>

      {/* Primary color */}
      <section>
        <SectionLabel>Primary color</SectionLabel>
        <div className="flex items-center gap-2 mb-3">
          {swatches.map(c => (
            <button
              key={c}
              onClick={() => setPrimaryColor(c)}
              className={cn(
                'relative w-8 h-8 rounded-full transition-transform hover:scale-110',
                primaryColor === c && 'ring-2 ring-offset-2 ring-text',
              )}
              style={{ background: c, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)' }}
              aria-label={c}
            >
              {primaryColor === c && (
                <I.Check size={14} className="text-white absolute inset-0 m-auto" strokeWidth={3} />
              )}
            </button>
          ))}
        </div>
        <FieldShell icon={I.Type}>
          <span className="text-text-3 text-xs font-mono">HEX</span>
          <input
            value={primaryColor}
            onChange={e => setPrimaryColor(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm font-mono"
          />
          <span className="w-5 h-5 rounded" style={{ background: primaryColor }} />
        </FieldShell>
      </section>

      {/* Font */}
      <section>
        <SectionLabel>Font family</SectionLabel>
        <div className="space-y-1.5">
          {fonts.map(f => (
            <button
              key={f}
              onClick={() => setFont(f)}
              className={cn(
                'w-full flex items-center justify-between p-3 rounded-sm transition-colors text-left',
                font === f ? 'bg-primary-light ring-1 ring-primary/40' : 'bg-surface-2 hover:bg-[#E6E6EC]',
              )}
            >
              <div>
                <div className="text-[13.5px] font-semibold text-text">{f}</div>
                <div className="text-[18px] text-text-2 leading-tight mt-0.5">The quick brown fox</div>
              </div>
              {font === f && <I.Check size={16} className="text-primary" />}
            </button>
          ))}
        </div>
      </section>

      {/* Intro / outro */}
      <section>
        <SectionLabel>Slides</SectionLabel>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 rounded-sm bg-surface-2">
            <div>
              <div className="text-[13.5px] font-semibold text-text">Branded intro slide</div>
              <div className="text-[11.5px] text-text-2">Show before step 1</div>
            </div>
            <Toggle checked={showIntro} onChange={setShowIntro} />
          </div>
          <div className="flex items-center justify-between p-3 rounded-sm bg-surface-2">
            <div>
              <div className="text-[13.5px] font-semibold text-text">Outro slide</div>
              <div className="text-[11.5px] text-text-2">Closing card with logo + CTA</div>
            </div>
            <Toggle checked={showOutro} onChange={setShowOutro} />
          </div>
        </div>
      </section>

      {/* Watermark */}
      <section>
        <SectionLabel>Watermark</SectionLabel>
        <FieldShell icon={I.Type}>
          <input
            value={watermark}
            onChange={e => setWatermark(e.target.value)}
            placeholder="Watermark text"
            className="flex-1 bg-transparent outline-none text-sm"
          />
        </FieldShell>
      </section>
    </div>
  );
}

// ─── Chapters panel ────────────────────────────────────────────────────
function ChaptersPanel() {
  const { state } = useStudioStore();
  const session = state.session;
  const [chapters, setChapters] = pUseState(session?.metadata?.chapterBreaks || []);
  if (!session) return null;
  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-4 border-b border-border">
        <SectionLabel hint={`${chapters.length} chapters`}>Auto-detected chapters</SectionLabel>
        <p className="text-[12.5px] text-text-2 leading-relaxed">
          We grouped the {session.metadata.stepCount} steps into chapters based on URL changes and action patterns.
          Drag the dividers in the script to rebalance.
        </p>
      </div>

      <div className="flex-1 scroll-y px-3 py-3 space-y-2">
        {/* Implicit first chapter */}
        <ChapterRow
          n={1}
          title="Getting started"
          stepRange="Steps 1 – 4"
          isFirst
        />
        {chapters.map((c, i) => (
          <ChapterRow
            key={i}
            n={i + 2}
            title={c.chapterTitle}
            stepRange={`After step ${session.steps.find(s => s.id === c.afterStepId)?.sequence ?? '?'}`}
            onRename={(t) => {
              const next = [...chapters];
              next[i] = { ...c, chapterTitle: t };
              setChapters(next);
            }}
            onDelete={() => setChapters(chapters.filter((_, j) => j !== i))}
          />
        ))}

        <button className="w-full mt-3 h-10 rounded-sm border border-dashed border-border text-[13px] text-text-2 inline-flex items-center justify-center gap-2 hover:bg-surface-2 hover:text-text transition-colors">
          <I.Plus size={14} /> Add chapter break
        </button>
      </div>
    </div>
  );
}

function ChapterRow({ n, title, stepRange, isFirst, onRename, onDelete }) {
  const [editing, setEditing] = pUseState(false);
  const [val, setVal] = pUseState(title);
  return (
    <div className="group p-3 rounded-sm bg-surface-2 hover:bg-[#E6E6EC] transition-colors">
      <div className="flex items-center gap-3">
        <span className="w-7 h-7 rounded-full bg-primary text-white inline-flex items-center justify-center text-[12px] font-bold tabular-nums">
          {n}
        </span>
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              autoFocus
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onBlur={() => { onRename?.(val); setEditing(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { onRename?.(val); setEditing(false); } }}
              className="w-full bg-white border border-primary rounded-md px-2 h-7 text-[13.5px] font-semibold outline-none"
            />
          ) : (
            <div
              className={cn('text-[13.5px] font-semibold text-text truncate', !isFirst && 'cursor-text')}
              onClick={() => !isFirst && setEditing(true)}
            >{title}</div>
          )}
          <div className="text-[11.5px] text-text-3">{stepRange}</div>
        </div>
        {!isFirst && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
            <IconButton icon={I.Trash2} label="Delete chapter" onClick={onDelete} size={28} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Locked phase-3/4 panels ───────────────────────────────────────────
function AIVoicePanel() {
  return (
    <ComingSoon title="AI Voiceovers" phase={3} description="Generate natural studio-quality narration from your scripts. 30+ voices, 12 languages, per-step preview.">
      <div className="p-6 space-y-4">
        <SectionLabel>Voice</SectionLabel>
        <div className="space-y-2">
          {['Maya (en-US, warm)', 'Rohan (en-GB, calm)', 'Sofia (es-ES, energetic)'].map(v => (
            <div key={v} className="h-12 rounded-sm bg-surface-2 flex items-center gap-3 px-3">
              <span className="w-8 h-8 rounded-full bg-primary/20" />
              <span className="text-[13px] text-text">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </ComingSoon>
  );
}
function MusicPanel() {
  return (
    <ComingSoon title="Background Music" phase={3} description="Royalty-free tracks tuned to your walkthrough length. Auto-ducked under voiceovers.">
      <div className="p-6 space-y-4">
        <SectionLabel>Trending</SectionLabel>
        {['Morning Sun · Ambient', 'Procedural · Lo-fi', 'Lift Off · Tech corporate'].map(v => (
          <div key={v} className="h-12 rounded-sm bg-surface-2 flex items-center gap-3 px-3">
            <span className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
              <I.Music2 size={14} />
            </span>
            <span className="text-[13px] text-text">{v}</span>
          </div>
        ))}
      </div>
    </ComingSoon>
  );
}
function VisualsPanel() {
  return (
    <ComingSoon title="Smart Visuals" phase={4} description="Auto-blur PII, swap backgrounds, beautify cursor paths, and apply screen recordings styling.">
      <div className="p-6 grid grid-cols-2 gap-2">
        {[0,1,2,3].map(i => (
          <div key={i} className="aspect-square rounded-sm bg-surface-2 stripe-placeholder" />
        ))}
      </div>
    </ComingSoon>
  );
}
function ZoomsPanel() {
  return (
    <ComingSoon title="Smart Zooms" phase={4} description="Cinematic zoom & pan generated from click points. Edit, reorder, or replace any zoom target.">
      <div className="p-6">
        <div className="h-32 rounded-sm bg-surface-2 stripe-placeholder mb-2" />
        <div className="space-y-1.5">
          <div className="h-8 rounded-sm bg-surface-2" />
          <div className="h-8 rounded-sm bg-surface-2" />
        </div>
      </div>
    </ComingSoon>
  );
}
function ElementsPanel() {
  return (
    <ComingSoon title="Library Elements" phase={4} description="Stickers, arrows, callout shapes, and emoji you can drop onto any step.">
      <div className="p-6 grid grid-cols-4 gap-2">
        {[0,1,2,3,4,5,6,7].map(i => (
          <div key={i} className="aspect-square rounded-sm bg-surface-2" />
        ))}
      </div>
    </ComingSoon>
  );
}

Object.assign(window, {
  ScriptPanel, BrandPanel, ChaptersPanel,
  AIVoicePanel, MusicPanel, VisualsPanel, ZoomsPanel, ElementsPanel,
});
