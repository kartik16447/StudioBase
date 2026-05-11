// Pages: HomePage, StudioPage, SOPPage, SharePage, BrandKitPage.

const { motion: pg_motion, AnimatePresence: pg_AP } = window.Motion;
const { useState: pgUseState, useMemo: pgUseMemo, useEffect: pgUseEffect } = React;

// ─── Page enter wrapper ────────────────────────────────────────────────
function PageFrame({ children, className = '' }) {
  return (
    <div className={cn('flex-1 min-h-0', className)}>
      {children}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// HOME / LIBRARY
// ────────────────────────────────────────────────────────────────────────
function HomePage() {
  const { navigate, setSession } = useStudioStore();
  const [view, setView] = pgUseState('grid');
  const [filter, setFilter] = pgUseState('all');
  const [search, setSearch] = pgUseState('');
  const [loading, setLoading] = pgUseState(true);
  pgUseEffect(() => {
    const t = setTimeout(() => setLoading(false), 900);
    return () => clearTimeout(t);
  }, []);

  const filtered = pgUseMemo(() => {
    return SAMPLE_SESSIONS.filter(s => {
      if (filter === 'sop' && s.sessionType !== 'steps') return false;
      if (filter === 'video' && s.sessionType !== 'video') return false;
      if (search && !s.aiOutputs.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [filter, search]);

  const openSession = (s) => {
    setSession(s.sessionId === SAMPLE_SESSION.sessionId ? SAMPLE_SESSION : { ...SAMPLE_SESSION, ...s });
    navigate('studio');
  };

  return (
    <PageFrame className="scroll-y bg-bg relative">
      <DotGrid className="!fixed" />
      {/* Page header */}
      <div className="max-w-[1320px] mx-auto px-10 pt-10 pb-6">
        <div className="flex items-end justify-between mb-1">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary mb-2">Welcome back, Kartik</div>
            <h1 className="text-[34px] font-semibold text-text leading-tight tracking-tight">Your library</h1>
            <p className="text-[15px] text-text-2 mt-1.5">{SAMPLE_SESSIONS.length} sessions · last captured {formatDate(SAMPLE_SESSIONS[0].capturedAt)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="md" icon={I.Sparkles}>New from template</Button>
            <Button variant="primary" size="md" icon={I.Plus}>Capture session</Button>
          </div>
        </div>

        {/* Stat row */}
        <div className="grid grid-cols-4 gap-4 mt-8">
          <StatCard label="Sessions captured" value="46" delta="+8 this week" tone="primary" icon={I.FileText} />
          <StatCard label="Total runtime" value="3h 22m" delta="across SOPs & videos" icon={I.Clock} />
          <StatCard label="Views this month" value="1,284" delta="↑ 24% vs last" tone="success" icon={I.Eye} />
          <StatCard label="Credits remaining" value="312" delta="of 500 monthly" icon={I.Zap} />
        </div>
      </div>

      {/* Filter bar */}
      <div className="max-w-[1320px] mx-auto px-10 mb-6 flex items-center gap-3 sticky top-0 z-10 bg-bg/85 backdrop-blur-md py-3 -my-3">
        <FieldShell icon={I.Search} className="!h-10 max-w-md flex-1">
          <input
            placeholder="Search sessions, tags, URLs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm"
          />
          <Kbd>⌘K</Kbd>
        </FieldShell>
        <div className="flex items-center bg-surface-2 rounded-pill p-0.5 relative">
          {[
            { id: 'all',   label: 'All' },
            { id: 'sop',   label: 'SOPs' },
            { id: 'video', label: 'Videos' },
          ].map(t => {
            const active = filter === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setFilter(t.id)}
                className={cn('relative px-3.5 h-8 rounded-pill text-[12.5px] font-semibold transition-colors', active ? 'text-text' : 'text-text-2')}
              >
                {active && <span className="absolute inset-0 bg-white rounded-pill shadow-sm" />}
                <span className="relative">{t.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center bg-surface-2 rounded-pill p-0.5">
          <button onClick={() => setView('grid')} className={cn('w-8 h-8 rounded-pill inline-flex items-center justify-center', view==='grid' ? 'bg-white shadow-sm text-text' : 'text-text-2')}><I.Grid size={14} /></button>
          <button onClick={() => setView('list')} className={cn('w-8 h-8 rounded-pill inline-flex items-center justify-center', view==='list' ? 'bg-white shadow-sm text-text' : 'text-text-2')}><I.List size={14} /></button>
        </div>
        <Button variant="ghost" size="md" icon={I.Filter}>Filter</Button>
      </div>

      {/* Grid */}
      <div className="max-w-[1320px] mx-auto px-10 pb-16 relative">
        <div
          className={cn(
            'grid gap-6',
            view === 'grid' ? 'grid-cols-3' : 'grid-cols-1',
          )}
        >
          {loading ? (
            <>
              {[0,1,2,3,4,5].map(i => <SessionCardSkeleton key={i} />)}
            </>
          ) : (
            <>
              <NewSessionCard onClick={() => alert('Open browser extension to start a capture session.')} />
              {filtered.map(s => (
                <SessionCard key={s.sessionId} session={s} onClick={() => openSession(s)} />
              ))}
            </>
          )}
        </div>

        {!loading && filtered.length === 0 && (
          <div className="text-center text-text-2 py-16">No sessions match your filters.</div>
        )}
      </div>
    </PageFrame>
  );
}

function StatCard({ label, value, delta, icon: Icon, tone = 'neutral' }) {
  const accent = {
    primary: 'text-primary bg-primary-light',
    success: 'text-[#1B7F3B] bg-[#E5F8EC]',
    neutral: 'text-text-2 bg-surface-2',
  }[tone];
  return (
    <div className="bg-surface rounded-card p-5 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11.5px] font-semibold uppercase tracking-wider text-text-2">{label}</span>
        <span className={cn('w-7 h-7 rounded-full inline-flex items-center justify-center', accent)}>
          <Icon size={13} strokeWidth={2} />
        </span>
      </div>
      <div className="text-[28px] font-semibold text-text leading-none tracking-tight tabular-nums">{value}</div>
      <div className="mt-1.5 text-[12px] text-text-2">{delta}</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// STUDIO — main editor (left panel + canvas/SOP)
// ────────────────────────────────────────────────────────────────────────
function StudioPage() {
  const { state, setActiveTab, togglePanel } = useStudioStore();
  const tabs = STUDIO_TABS;
  const activeTab = tabs.find(t => t.id === state.activeTab) || tabs[0];
  const locked = isLocked(activeTab);

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <StudioTopBar />
      <div className="flex-1 flex min-h-0">

        {/* LEFT PANEL — slides out on toggle */}
        <pg_AP initial={false}>
          {state.isPanelOpen && (
            <pg_motion.aside
              key="leftpanel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 480, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="shrink-0 border-r border-border bg-surface flex flex-col overflow-hidden"
            >
              {/* Tab bar */}
              <div className="px-3 pt-2 border-b border-border overflow-x-auto scroll-y">
                <div className="flex items-center gap-0 min-w-max">
                  {tabs.map(t => {
                    const active = state.activeTab === t.id;
                    const tabLocked = isLocked(t);
                    return (
                      <button
                        key={t.id}
                        onClick={() => setActiveTab(t.id)}
                        className={cn(
                          'relative inline-flex items-center gap-1.5 h-11 px-3 text-[12.5px] font-medium transition-colors',
                          active ? 'text-text' : 'text-text-2 hover:text-text',
                          tabLocked && 'opacity-60',
                        )}
                      >
                        <t.icon size={14} strokeWidth={1.9} />
                        {t.label}
                        {tabLocked && <I.Lock size={10} className="text-text-3" />}
                        {active && (
                          <pg_motion.span
                            layoutId="tab-indicator"
                            className="absolute -bottom-px left-2 right-2 h-[2px] rounded-full bg-primary"
                            transition={{ type:'spring', stiffness:420, damping:34 }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Panel body */}
              <div className="flex-1 min-h-0 overflow-hidden">
                <pg_AP mode="wait">
                  <pg_motion.div
                    key={activeTab.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                    className="h-full"
                  >
                    <activeTab.component />
                  </pg_motion.div>
                </pg_AP>
              </div>
            </pg_motion.aside>
          )}
        </pg_AP>

        {/* CANVAS / SOP */}
        <section className="flex-1 min-w-0 flex flex-col relative">
          {/* Collapse handle */}
          <button
            onClick={togglePanel}
            className="absolute top-3 left-3 z-20 glass rounded-pill h-8 px-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-text-2 hover:text-text"
            title="Toggle panel (⌘\)"
          >
            {state.isPanelOpen ? <I.ChevronLeft size={14} /> : <I.ChevronRight size={14} />}
            <span>{state.isPanelOpen ? 'Collapse' : 'Open panel'}</span>
            <Kbd>⌘\</Kbd>
          </button>

          {state.activeView === 'sop' ? <SOPCanvas /> : <VideoCanvas />}
        </section>
      </div>
      <FloatingToolbar />
    </div>
  );
}

// ─── SOPCanvas — the hero ──────────────────────────────────────────────
function SOPCanvas() {
  const { state, setFocusStep } = useStudioStore();
  const session = state.session;
  const [loading, setLoading] = pgUseState(true);
  const [isProcessing, setIsProcessing] = pgUseState(false);
  pgUseEffect(() => {
    const t = setTimeout(() => setLoading(false), 700);
    return () => clearTimeout(t);
  }, []);
  if (!session) return null;
  // Interleave chapters between steps
  const chapterMap = new Map((session.metadata.chapterBreaks || []).map(c => [c.afterStepId, c]));
  const items = [];
  session.steps.forEach((s, i) => {
    items.push({ kind: 'step', step: s, idx: i });
    if (chapterMap.has(s.id)) items.push({ kind: 'chapter', chapter: chapterMap.get(s.id) });
  });

  return (
    <div className="flex-1 min-h-0 scroll-y bg-bg relative">
      <DotGrid className="!fixed" glowRadius={500} />
      <div className="max-w-[860px] mx-auto px-6 pt-16 pb-32 relative">

        {/* Title block */}
        <pg_motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6"
        >
          <Badge tone="primary" size="md" icon={I.Sparkles}>AI generated · just now</Badge>
          <h1 className="text-[38px] font-semibold text-text tracking-tight leading-[1.15] mt-3" style={{ textWrap: 'balance' }}>
            {session.aiOutputs.title}
          </h1>
          <div className="flex items-center gap-3 mt-4 text-[13px] text-text-2">
            <span className="inline-flex items-center gap-1.5"><I.FileText size={13} /> {session.metadata.stepCount} steps</span>
            <span className="text-text-3">·</span>
            <span className="inline-flex items-center gap-1.5"><I.Clock size={13} /> {formatDuration(session.metadata.durationMs)}</span>
            <span className="text-text-3">·</span>
            <span className="inline-flex items-center gap-1.5"><I.Globe size={13} /> {session.capturedUrl?.replace(/^https?:\/\//,'').split('/')[0]}</span>
            <span className="text-text-3">·</span>
            <span>captured {formatDate(session.capturedAt)}</span>
          </div>
        </pg_motion.header>

        {/* Summary callout */}
        <SummaryCallout session={session} />

        {/* AI regen toggle (demo) */}
        <div className="my-6 flex items-center justify-end">
          <AIButton
            isProcessing={isProcessing}
            icon={I.Sparkles}
            onClick={() => {
              setIsProcessing(true);
              setTimeout(() => setIsProcessing(false), 3000);
            }}
          >
            {isProcessing ? 'Generating AI Content…' : 'Generate AI Content'}
          </AIButton>
        </div>

        {/* Items (steps + chapters) */}
        <AIShimmer isActive={isProcessing} className="rounded-card">
        <pg_motion.div className="space-y-6">
          {loading ? (
            [0,1,2,3].map(i => <StepCardSkeleton key={i} />)
          ) : items.map((it, i) => (
            it.kind === 'step' ? (
              <StepCard
                key={it.step.id}
                step={it.step}
                index={it.idx}
                hue={244 + (it.idx * 11) % 80}
                focused={state.focusedStepId === it.step.id}
                onFocus={() => setFocusStep(it.step.id)}
              />
            ) : (
              <ChapterBreak key={'ch-' + i} index={(items.slice(0, i+1).filter(x => x.kind === 'chapter').length) + 1} title={it.chapter.chapterTitle} />
            )
          ))}
        </pg_motion.div>
        </AIShimmer>

        {/* Footer card */}
        <div className="mt-12 rounded-card bg-surface p-8 text-center shadow-card">
          <div className="w-12 h-12 mx-auto rounded-full bg-primary-light flex items-center justify-center text-primary mb-3">
            <I.CheckCircle size={22} strokeWidth={2} />
          </div>
          <h3 className="text-[20px] font-semibold text-text">You're all done</h3>
          <p className="text-[13.5px] text-text-2 mt-1">Publish to share with your team or export to PDF / Notion.</p>
          <div className="flex items-center justify-center gap-2 mt-5">
            <Button variant="ghost" size="md" icon={I.Download}>Export PDF</Button>
            <Button variant="primary" size="md" icon={I.Share2}>Publish & share</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── VideoCanvas — reserved (Phase 3) ─────────────────────────────────
function VideoCanvas() {
  return (
    <div className="flex-1 studio-gradient flex flex-col items-center justify-center px-10">
      <div className="relative w-full max-w-4xl aspect-video rounded-img shadow-card-lifted bg-white overflow-hidden">
        <ScreenshotPlaceholder step={SAMPLE_SESSION.steps[5]} hue={244} aspect="16/9" rounded="" className="w-full h-full" />
        {/* Center play button */}
        <button className="absolute inset-0 m-auto w-20 h-20 rounded-full glass flex items-center justify-center hover:scale-105 transition">
          <I.Play size={28} className="text-text translate-x-0.5" />
        </button>
      </div>
      <div className="mt-6 text-center max-w-md">
        <Badge tone="primary" size="md" icon={I.Lock}>Phase 3</Badge>
        <h3 className="text-[20px] font-semibold text-text mt-3">Cinematic video preview</h3>
        <p className="text-[13.5px] text-text-2 mt-1">Auto-zoom, smart cursor, AI voiceover and music will render right here when Phase 3 lands.</p>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// SHARE — public, no auth
// ────────────────────────────────────────────────────────────────────────
function SharePage() {
  const { state } = useStudioStore();
  const session = state.session || SAMPLE_SESSION;
  const chapterMap = new Map((session.metadata.chapterBreaks || []).map(c => [c.afterStepId, c]));

  return (
    <PageFrame className="scroll-y bg-bg">
      <ShareHeader session={session} />

      <div className="max-w-[860px] mx-auto px-6 pt-10 pb-32">
        <h1 className="text-[36px] font-semibold text-text tracking-tight leading-[1.15]" style={{ textWrap: 'balance' }}>{session.aiOutputs.title}</h1>
        <div className="flex items-center gap-3 mt-3 text-[13px] text-text-2">
          <Avatar name="Kartik Upadhyay" size={22} hue={244} />
          <span className="font-medium text-text">Kartik Upadhyay</span>
          <span className="text-text-3">·</span>
          <span>{formatDate(session.capturedAt)}</span>
        </div>

        <SummaryCallout session={session} />

        <div className="space-y-6">
          {session.steps.map((s, i) => (
            <React.Fragment key={s.id}>
              <StepCard step={s} index={i} hue={244 + (i*11) % 80} />
              {chapterMap.has(s.id) && (
                <ChapterBreak index={[...chapterMap.values()].indexOf(chapterMap.get(s.id)) + 2} title={chapterMap.get(s.id).chapterTitle} />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="mt-16 text-center text-[12.5px] text-text-3 flex items-center justify-center gap-1.5">
          <I.Wand2 size={12} /> Created with StudioBase ·
          <a className="text-primary font-medium hover:opacity-80" href="#">Make your own walkthrough</a>
        </div>
      </div>
    </PageFrame>
  );
}

// ────────────────────────────────────────────────────────────────────────
// BRAND KIT
// ────────────────────────────────────────────────────────────────────────
function BrandKitPage() {
  const tabs = [
    { id: 'logos', label: 'Logos', icon: I.Image, phase: 2 },
    { id: 'doctmpl', label: 'Doc Templates', icon: I.FileText, phase: 2 },
    { id: 'videotmpl', label: 'Video Templates', icon: I.Play, phase: 3 },
    { id: 'voices', label: 'Voices', icon: I.Mic, phase: 3 },
    { id: 'avatars', label: 'Avatars', icon: I.User, phase: 3 },
    { id: 'backgrounds', label: 'Backgrounds', icon: I.Image, phase: 4 },
    { id: 'music', label: 'Music', icon: I.Music2, phase: 3 },
    { id: 'glossary', label: 'Glossary', icon: I.Languages, phase: 4 },
  ];
  const [active, setActive] = pgUseState('logos');
  const tab = tabs.find(t => t.id === active);
  const locked = tab.phase > CURRENT_PHASE;

  return (
    <PageFrame className="scroll-y bg-bg">
      <div className="max-w-[1100px] mx-auto px-10 pt-10 pb-16">
        <Badge tone="primary" size="md" icon={I.Palette}>Workspace</Badge>
        <h1 className="text-[34px] font-semibold text-text tracking-tight leading-tight mt-3">Brand Kit</h1>
        <p className="text-[14.5px] text-text-2 mt-1.5">Your logo, palette and templates are applied to every SOP and video automatically.</p>

        {/* Tabs */}
        <div className="mt-8 border-b border-border flex items-center gap-1 overflow-x-auto">
          {tabs.map(t => {
            const locked = t.phase > CURRENT_PHASE;
            const isActive = active === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className={cn(
                  'relative inline-flex items-center gap-1.5 h-11 px-4 text-[13px] font-medium whitespace-nowrap',
                  isActive ? 'text-text' : 'text-text-2 hover:text-text',
                  locked && 'opacity-60',
                )}
              >
                <t.icon size={14} />
                {t.label}
                {locked && <I.Lock size={11} className="text-text-3" />}
                {isActive && <pg_motion.span layoutId="brand-tab" className="absolute bottom-0 left-3 right-3 h-[2px] bg-primary rounded-full" transition={{ type:'spring', stiffness:420, damping:34 }} />}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="mt-8 min-h-[400px] relative">
          <PgAP mode="wait">
            <pg_motion.div
              key={active}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
            >
              {locked ? (
                <ComingSoon title={tab.label} phase={tab.phase} description={`This brand kit section unlocks in Phase ${tab.phase}.`}>
                  <div className="grid grid-cols-3 gap-4">
                    {[0,1,2,3,4,5].map(i => <div key={i} className="aspect-[4/3] rounded-card bg-surface shadow-card stripe-placeholder" />)}
                  </div>
                </ComingSoon>
              ) : active === 'logos' ? <LogosTab /> : <DocTemplatesTab />}
            </pg_motion.div>
          </PgAP>
        </div>
      </div>
    </PageFrame>
  );
}

function LogosTab() {
  const [primary, setPrimary] = pgUseState('#5E5CE6');
  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Drop zone */}
      <div className="col-span-2">
        <SectionLabel>Workspace logo</SectionLabel>
        <div className="grad-border h-56 flex items-center justify-center mb-6">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-primary-light flex items-center justify-center mb-3">
              <I.Upload size={20} className="text-primary" />
            </div>
            <div className="text-[14px] font-semibold text-text mb-1">Drag &amp; drop your logo</div>
            <div className="text-[12px] text-text-2">SVG or PNG, transparent background recommended</div>
            <Button variant="ghost" size="sm" className="mt-4">Browse files</Button>
          </div>
        </div>

        <SectionLabel hint="Used on intro/outro & exports">Logo variants</SectionLabel>
        <div className="grid grid-cols-3 gap-3">
          {['Light', 'Dark', 'Icon'].map((v, i) => (
            <div key={v} className="rounded-card p-5 shadow-card bg-surface">
              <div
                className="h-20 rounded-img mb-3 flex items-center justify-center font-black text-[28px]"
                style={{
                  background: i === 1 ? '#111' : '#FFF',
                  color: i === 1 ? '#FFF' : '#1D1D1F',
                  border: '1px solid rgba(0,0,0,0.06)',
                }}
              >
                {i === 2 ? <span style={{ color: primary }}>S</span> : <span>Studio<span style={{ color: primary }}>Base</span></span>}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold">{v}</span>
                <IconButton icon={I.Download} label="Download" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Color picker */}
      <div>
        <SectionLabel>Primary color</SectionLabel>
        <div className="rounded-card bg-surface shadow-card p-5">
          <div className="grid grid-cols-3 gap-3 mb-4">
            {['#5E5CE6','#0A84FF','#30D158','#FF9F0A','#FF453A','#BF5AF2'].map(c => (
              <button
                key={c}
                onClick={() => setPrimary(c)}
                className={cn('aspect-square rounded-img relative transition-transform hover:scale-105', primary === c && 'ring-2 ring-offset-2 ring-text')}
                style={{ background: c }}
              >
                {primary === c && <I.Check size={18} className="text-white absolute inset-0 m-auto" strokeWidth={3} />}
              </button>
            ))}
          </div>
          <FieldShell icon={I.Type}>
            <span className="text-text-3 text-[11px] font-mono uppercase">HEX</span>
            <input value={primary} onChange={e => setPrimary(e.target.value)} className="flex-1 bg-transparent outline-none text-sm font-mono" />
            <span className="w-5 h-5 rounded" style={{ background: primary }} />
          </FieldShell>
        </div>

        <SectionLabel className="mt-6">Font</SectionLabel>
        <div className="rounded-card bg-surface shadow-card p-5">
          <div className="text-text-2 text-[11px] mb-1">Currently using</div>
          <div className="text-[22px] font-semibold tracking-tight">SF Pro Display</div>
          <div className="text-[13px] text-text-2 mt-1">A versatile sans-serif with high legibility at small sizes.</div>
          <Button variant="ghost" size="sm" className="mt-4" iconRight={I.ChevronDown}>Change font</Button>
        </div>
      </div>
    </div>
  );
}

function DocTemplatesTab() {
  const templates = [
    { name: 'Compact', desc: 'Side-by-side screenshot and instructions', hue: 244, layout: 'compact' },
    { name: 'Hero', desc: 'Full-width screenshot, instructions below', hue: 198, layout: 'hero' },
    { name: 'Numbered', desc: 'Big watermark number, minimalist body', hue: 162, layout: 'numbered' },
    { name: 'Briefing', desc: 'Two-column with collapsible details', hue: 22, layout: 'briefing' },
    { name: 'Quick reference', desc: 'Card grid for power users', hue: 282, layout: 'grid' },
    { name: 'Tutorial', desc: 'Chapter-driven, with summary boxes', hue: 50, layout: 'tutorial' },
  ];
  return (
    <div className="grid grid-cols-3 gap-5">
      {templates.map((t, i) => (
        <div key={t.name} className={cn('rounded-card bg-surface shadow-card overflow-hidden group cursor-pointer hover:shadow-card-hover transition-shadow', i === 0 && 'ring-2 ring-primary')}>
          <div className="aspect-[5/4] p-4 stripe-placeholder relative">
            <TemplatePreview layout={t.layout} hue={t.hue} />
            {i === 0 && <Badge tone="primary" size="sm" className="absolute top-2 right-2">In use</Badge>}
          </div>
          <div className="p-4 border-t border-border">
            <div className="text-[14px] font-semibold text-text">{t.name}</div>
            <div className="text-[12px] text-text-2 mt-0.5">{t.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TemplatePreview({ layout, hue }) {
  const tint = `hsl(${hue} 70% 60%)`;
  if (layout === 'numbered') {
    return (
      <div className="bg-white rounded-img h-full p-3 relative shadow-inner-border">
        <div className="absolute top-2 right-2 font-black text-[40px]" style={{ color: tint, opacity: 0.18 }}>01</div>
        <div className="h-12 rounded mb-2 bg-gradient-to-br from-white to-surface-2 border border-border" />
        <div className="h-1.5 rounded bg-text/70 w-3/4 mb-1" />
        <div className="h-1.5 rounded bg-text/30 w-full mb-1" />
        <div className="h-1.5 rounded bg-text/30 w-5/6" />
      </div>
    );
  }
  if (layout === 'hero') {
    return (
      <div className="bg-white rounded-img h-full p-2">
        <div className="h-1/2 rounded mb-1.5 border border-border" style={{ background: `linear-gradient(135deg, ${tint}22, ${tint}11)` }} />
        <div className="h-1.5 rounded bg-text/80 w-3/4 mb-1" />
        <div className="h-1.5 rounded bg-text/30 w-full mb-1" />
        <div className="h-1.5 rounded bg-text/30 w-5/6" />
      </div>
    );
  }
  if (layout === 'compact') {
    return (
      <div className="bg-white rounded-img h-full p-2 flex gap-2">
        <div className="w-1/2 rounded border border-border" style={{ background: `linear-gradient(135deg, ${tint}22, ${tint}11)` }} />
        <div className="w-1/2 space-y-1.5 py-1">
          <div className="h-1.5 rounded bg-text/80 w-3/4" />
          <div className="h-1.5 rounded bg-text/30 w-full" />
          <div className="h-1.5 rounded bg-text/30 w-5/6" />
          <div className="h-1.5 rounded bg-text/30 w-3/4" />
        </div>
      </div>
    );
  }
  if (layout === 'briefing') {
    return (
      <div className="bg-white rounded-img h-full p-2 grid grid-cols-2 gap-1.5">
        {[0,1,2,3].map(i => (
          <div key={i} className="rounded border border-border p-1">
            <div className="h-1.5 rounded bg-text/70 w-3/4 mb-1" />
            <div className="h-1.5 rounded bg-text/20 w-full mb-1" />
            <div className="h-1.5 rounded bg-text/20 w-5/6" />
          </div>
        ))}
      </div>
    );
  }
  if (layout === 'grid') {
    return (
      <div className="bg-white rounded-img h-full p-2 grid grid-cols-3 gap-1">
        {[0,1,2,3,4,5].map(i => (
          <div key={i} className="aspect-square rounded border border-border" style={{ background: `linear-gradient(135deg, ${tint}22, ${tint}11)` }} />
        ))}
      </div>
    );
  }
  // tutorial
  return (
    <div className="bg-white rounded-img h-full p-2">
      <div className="h-2 rounded mb-2" style={{ background: tint, width: '30%' }} />
      <div className="h-1.5 rounded bg-text/70 w-2/3 mb-1" />
      <div className="h-1.5 rounded bg-text/30 w-full mb-1" />
      <div className="h-8 rounded mt-1.5 border border-border" style={{ background: `linear-gradient(135deg, ${tint}22, ${tint}11)` }} />
    </div>
  );
}

Object.assign(window, { HomePage, StudioPage, SharePage, BrandKitPage });
