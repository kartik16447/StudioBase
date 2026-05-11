import React, { useState, useEffect, useRef } from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { I } from '../icons';
import { 
  cn, Badge, IconButton, StepNumber, SectionLabel, FieldShell, AIShimmer, Toggle, Button, ScreenshotPlaceholder
} from '../ui';
import type { Step } from '../../../../shared/types/session';


// ─── Script panel ──────────────────────────────────────────────────────
// Per-step text editor — list with selectable rows, edit inline.
export const ScriptPanel: React.FC = () => {
  const { session, focusedStepId, setFocusStep, currentStepIndex, setStepIndex, updateStep, triggerScroll, scrollTrigger } = useStudioStore();
  
  const [tone, setTone] = useState('Friendly & concise');
  const [search, setSearch] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const stepRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!focusedStepId) return;
    const el = stepRefs.current.get(focusedStepId);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [focusedStepId, scrollTrigger]);

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
          {steps.map((step, idx) => (
            <ScriptStepRow 
              key={step.id} 
              step={step} 
              active={focusedStepId === step.id} 
              isPlaying={currentStepIndex === idx}
              onClick={() => {
                setFocusStep(step.id);
                setStepIndex(idx);
                triggerScroll();
              }}
              onUpdate={(text) => updateStep(step.id, { textOverride: text })}
              innerRef={el => { if (el) stepRefs.current.set(step.id, el); else stepRefs.current.delete(step.id); }}
            />
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
};

const ScriptStepRow: React.FC<{ 
  step: Step, 
  active: boolean, 
  isPlaying: boolean,
  onClick: () => void,
  onUpdate: (text: string) => void,
  innerRef?: (el: HTMLDivElement | null) => void
}> = ({ step, active, isPlaying, onClick, onUpdate, innerRef }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(step.textOverride || step.generatedText || '');

  return (
    <div
      ref={innerRef}
      onClick={onClick}
      className={cn(
        'rounded-sm p-3 cursor-pointer transition-all border group relative',
        active ? 'bg-primary-light border-primary/30' : 'bg-transparent border-transparent hover:bg-surface-2',
        isPlaying && !active && 'ring-1 ring-primary/20'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="relative">
          <StepNumber n={step.sequence} size="badge" />
          {isPlaying && (
            <span className="absolute -right-1 -top-1 w-2.5 h-2.5 bg-primary rounded-full ring-2 ring-white animate-pulse" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10.5px] font-bold tracking-wider uppercase text-text-3">{step.action}</span>
            {step.elementText && (
              <span className="text-[11px] text-text-2 font-mono truncate">· {step.elementText}</span>
            )}
            {step.textOverride && <Badge tone="primary" size="sm" className="ml-auto">edited</Badge>}
          </div>
          
          {isEditing ? (
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => {
                setIsEditing(false);
                onUpdate(text);
              }}
              className="w-full bg-white border border-primary rounded-md p-2 text-[13px] text-text outline-none resize-none"
              rows={3}
            />
          ) : (
            <p 
              className="text-[13px] text-text leading-snug line-clamp-3 group-hover:line-clamp-none transition-all" 
              style={{ textWrap: 'pretty' as any }}
              onClick={(e) => {
                if (active) {
                  e.stopPropagation();
                  setIsEditing(true);
                }
              }}
            >
              {text}
            </p>
          )}
        </div>
      </div>
      
      {active && !isEditing && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <IconButton icon={I.Edit2} label="Edit text" size={28} onClick={() => setIsEditing(true)} />
        </div>
      )}
    </div>
  );
};

// ─── Brand panel ───────────────────────────────────────────────────────
export const BrandPanel: React.FC = () => {
  const [primaryColor, setPrimaryColor] = useState('#5E5CE6');
  const [font, setFont] = useState('SF Pro');
  const [showIntro, setShowIntro] = useState(true);
  const [showOutro, setShowOutro] = useState(false);
  const [watermark, setWatermark] = useState('StudioBase');
  const swatches = ['#5E5CE6', '#0A84FF', '#30D158', '#FF9F0A', '#FF453A', '#BF5AF2', '#FF375F', '#1D1D1F'];
  const fonts = ['SF Pro', 'Inter', 'Geist', 'Söhne', 'Söhne Mono', 'Helvetica Neue'];

  return (
    <div className="h-full scroll-y px-5 py-5 space-y-7">
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
};

// ─── Chapters panel ────────────────────────────────────────────────────
export const ChaptersPanel: React.FC = () => {
  const session = useStudioStore(state => state.session);
  const [chapters, setChapters] = useState(session?.metadata?.chapterBreaks || []);

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
};

const ChapterRow: React.FC<{ n: number, title: string, stepRange: string, isFirst?: boolean, onRename?: (t: string) => void, onDelete?: () => void }> = ({ 
  n, title, stepRange, isFirst, onRename, onDelete 
}) => {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(title);
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
};

// ─── ComingSoon / Locked panels ───────────────────────────────────────
export const ComingSoon: React.FC<{ title: string, phase: number, description: string, children?: React.ReactNode }> = ({ title, phase, description, children }) => {
  return (
    <div className="relative h-full">
      <div className="opacity-40 pointer-events-none">{children}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center p-10 text-center bg-surface/40 backdrop-blur-[2px]">
        <Badge tone="primary" size="md" icon={I.Lock}>Phase {phase}</Badge>
        <h3 className="text-[18px] font-semibold text-text mt-3">{title}</h3>
        <p className="text-[13px] text-text-2 mt-2 leading-relaxed max-w-[260px]">{description}</p>
        <Button variant="ghost" size="sm" className="mt-6">Notify when ready</Button>
      </div>
    </div>
  );
};

export const AIVoicePanel: React.FC = () => (
  <ComingSoon title="AI Voiceovers" phase={3} description="Generate natural studio-quality narration from your scripts. 30+ voices, 12 languages, per-step preview." />
);
export const MusicPanel: React.FC = () => (
  <ComingSoon title="Background Music" phase={3} description="Royalty-free tracks tuned to your walkthrough length. Auto-ducked under voiceovers." />
);
export const VisualsPanel: React.FC = () => (
  <ComingSoon title="Smart Visuals" phase={4} description="Auto-blur PII, swap backgrounds, beautify cursor paths, and apply screen recordings styling." />
);
export const ZoomsPanel: React.FC = () => {
  const { session, focusedStepIndex, updateStep } = useStudioStore();
  const currentStep = session?.steps[focusedStepIndex];

  if (!session || !currentStep) return null;

  const target = currentStep.animationTarget || {
    centerX: 50,
    centerY: 50,
    zoomScale: 1,
    transitionType: 'zoom',
    transitionDurationMs: 800
  };

  const updateTarget = (updates: Partial<typeof target>) => {
    updateStep(currentStep.id, {
      animationTarget: { ...target, ...updates }
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-4 border-b border-border">
        <SectionLabel>Cinematic Zoom</SectionLabel>
        <p className="text-[12.5px] text-text-2">
          Adjust the focus point and zoom level for step {currentStep.sequence}.
        </p>
      </div>

      <div className="flex-1 scroll-y px-5 py-5 space-y-6">
        <section>
          <SectionLabel hint={`${target.zoomScale.toFixed(1)}x`}>Zoom scale</SectionLabel>
          <input 
            type="range" min="1" max="4" step="0.1" 
            value={target.zoomScale}
            onChange={(e) => updateTarget({ zoomScale: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-surface-2 rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <div className="flex justify-between text-[10px] text-text-3 font-bold mt-2 uppercase tracking-wider">
            <span>Wide</span>
            <span>Tight</span>
          </div>
        </section>

        <section>
          <SectionLabel hint={`${target.transitionDurationMs}ms`}>Transition speed</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            {[400, 800, 1200].map(ms => (
              <button
                key={ms}
                onClick={() => updateTarget({ transitionDurationMs: ms })}
                className={cn(
                  'h-9 rounded-sm border text-[12px] font-medium transition-all',
                  target.transitionDurationMs === ms
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'bg-surface-2 border-transparent text-text-2 hover:bg-[#E6E6EC]'
                )}
              >
                {ms === 400 ? 'Fast' : ms === 800 ? 'Smooth' : 'Slow'}
              </button>
            ))}
          </div>
        </section>

        <section>
          <SectionLabel>Focus point</SectionLabel>
          <div className="aspect-video bg-surface-2 rounded-md border border-border relative overflow-hidden group">
            <ScreenshotPlaceholder step={currentStep} session={session} showChrome={false} className="w-full h-full opacity-60" />
            <div 
              className="absolute w-8 h-8 -ml-4 -mt-4 border-2 border-primary rounded-full bg-primary/20 flex items-center justify-center shadow-card-lifted"
              style={{ left: `${target.centerX}%`, top: `${target.centerY}%` }}
            >
              <div className="w-1 h-1 bg-primary rounded-full" />
            </div>
            <div className="absolute inset-0 cursor-crosshair" onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * 100;
              const y = ((e.clientY - rect.top) / rect.height) * 100;
              updateTarget({ centerX: x, centerY: y });
            }} />
          </div>
          <p className="text-[11px] text-text-3 mt-2">Click the preview to reposition the camera focus.</p>
        </section>

        <section>
          <SectionLabel>Transition style</SectionLabel>
          <div className="space-y-2">
            {(['zoom', 'fade', 'instant'] as const).map(type => (
              <button
                key={type}
                onClick={() => updateTarget({ transitionType: type })}
                className={cn(
                  'w-full flex items-center justify-between p-3 rounded-sm border transition-all text-left',
                  target.transitionType === type
                    ? 'bg-primary-light border-primary/40'
                    : 'bg-surface-2 border-transparent hover:bg-[#E6E6EC]'
                )}
              >
                <span className="text-[13px] font-semibold text-text capitalize">{type}</span>
                {target.transitionType === type && <I.Check size={14} className="text-primary" strokeWidth={3} />}
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="px-5 py-3 border-t border-border">
        <Button variant="primary" size="sm" className="w-full" icon={I.Sparkles}>Auto-focus elements</Button>
      </div>
    </div>
  );
};
export const ElementsPanel: React.FC = () => (
  <ComingSoon title="Library Elements" phase={4} description="Stickers, arrows, callout shapes, and emoji you can drop onto any step." />
);
