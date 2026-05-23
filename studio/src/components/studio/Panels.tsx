import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStudioStore } from '../../store/useStudioStore';
import { I } from '../icons';
import { 
  cn, Badge, IconButton, StepNumber, SectionLabel, FieldShell, AIShimmer, Toggle, Button, ScreenshotPlaceholder, Tooltip
} from '../ui';
import type { Step } from '../../../../shared/types/session';
import { apiClient } from '../../lib/apiClient';
import { displayText } from '../../lib/textUtils';
import { showToast } from '../GlobalToast';


// ─── Script panel ──────────────────────────────────────────────────────
// Per-step text editor — list with selectable rows, edit inline.
export const ScriptPanel: React.FC = () => {
  const session = useStudioStore(state => state.session);
  const focusedStepId = useStudioStore(state => state.focusedStepId);
  const setFocusStep = useStudioStore(state => state.setFocusStep);
  const currentStepIndex = useStudioStore(state => state.focusedStepIndex);
  const setStepIndex = useStudioStore(state => state.setStepIndex);
  const updateStep = useStudioStore(state => state.updateStep);
  const triggerScroll = useStudioStore(state => state.triggerScroll);
  const scrollTrigger = useStudioStore(state => state.scrollTrigger);
  
  const [tone, setTone] = useState('Friendly & concise');
  const [search, setSearch] = useState('');
  const isAiProcessing = useStudioStore(state => state.isAiProcessing);
  const triggerPipeline = useStudioStore(state => state.triggerPipeline);
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
            disabled={isAiProcessing}
            onClick={async () => {
              console.log('[ScriptPanel][Regenerate all] Button clicked.');
              try {
                await triggerPipeline();
              } catch (err: any) {
                console.error('[ScriptPanel][Regenerate all] triggerPipeline failed!', err);
                showToast('error', err?.message || 'AI generation failed');
              }
            }}
            className="text-[11px] text-primary font-semibold inline-flex items-center gap-1 hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <I.Sparkles size={11} strokeWidth={2.4} className={cn(isAiProcessing && "animate-spin")} /> {isAiProcessing ? 'Regenerating...' : 'Regenerate all'}
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
      <AIShimmer isActive={isAiProcessing} className="flex-1 min-h-0">
        <div className="h-full scroll-y p-2 space-y-1">
          {steps.map((step, idx) => (
            <ScriptStepRow 
              key={`${step.id}-${idx}`} 
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
            <div className="text-center text-text-3 text-sm py-12 px-6">
              No steps match your search. Try different keywords.
            </div>
          )}
        </div>
      </AIShimmer>

      {/* Footer — bulk actions */}
      <div className="px-5 py-3 border-t border-border flex items-center justify-between shrink-0 bg-surface/80 backdrop-blur-sm">
        <span className="text-[12px] text-text-3 font-medium">
          {steps.length} of {session.steps.length} steps
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={I.Languages} className="h-8 text-[12px]">
            Translate
          </Button>
        </div>
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
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    setText(step.textOverride || step.generatedText || '');
  }, [step.textOverride, step.generatedText]);

  const deleteStep = useStudioStore(state => state.deleteStep);
  const session = useStudioStore(state => state.session);
  const updateStep = useStudioStore(state => state.updateStep);

  const handleRegenerate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log(`[Panels][AI Regenerate] Button clicked for step ${step.id}`);
    if (!session || isGenerating) {
      console.log(`[Panels][AI Regenerate] Bailing out. Session: ${!!session}, isGenerating: ${isGenerating}`);
      return;
    }
    
    const stepIndex = session.steps.findIndex(s => s.id === step.id);
    let visualDurationSeconds = 3.0;
    
    if (stepIndex !== -1 && stepIndex < session.steps.length - 1) {
      const nextStep = session.steps[stepIndex + 1];
      if (nextStep.timestamp && step.timestamp) {
        visualDurationSeconds = (nextStep.timestamp - step.timestamp) / 1000;
      }
    }
    
    console.log(`[Panels][AI Regenerate] Calculated visual duration constraint: ${visualDurationSeconds}s based on next step timestamp`);
    console.log(`[Panels][AI Regenerate] Setting UI state to isGenerating=true and sending POST request to /sessions/${session.sessionId}/steps/${step.id}/generate-script with payload:`, { visualDurationSeconds });
    
    setIsGenerating(true);
    try {
      const res = await apiClient.post<{ generatedText: string, budgetSeconds: number }>(
        `/sessions/${session.sessionId}/steps/${step.id}/generate-script`,
        { visualDurationSeconds }
      );
      
      console.log(`[Panels][AI Regenerate] Successfully received AI response! Data:`, res);
      console.log(`[Panels][AI Regenerate] Will write text back to frontend store and clear textOverride.`);
      
      if (res.generatedText) {
        setText(res.generatedText);
        updateStep(step.id, { generatedText: res.generatedText, textOverride: undefined });
      } else {
        console.warn(`[Panels][AI Regenerate] API returned empty or missing generatedText (maybe parsing failed silently?):`, res);
      }
    } catch (err) {
      console.error(`[Panels][AI Regenerate] Exception during script generation for step ${step.id}:`, err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div
      ref={innerRef}
      onClick={onClick}
      className={cn(
        'group relative rounded-sm p-4 transition-all duration-200 cursor-pointer border-l-[3px]',
        active 
          ? 'bg-primary-light border-primary shadow-sm ring-1 ring-primary/5' 
          : 'bg-transparent border-transparent hover:bg-surface-2 hover:border-text-3/30',
        isPlaying && !active && 'bg-surface-2 ring-1 ring-primary/10'
      )}
    >
      <div className="flex items-start gap-4">
        <div className="relative shrink-0 pt-0.5">
          <StepNumber n={step.sequence} size="badge" className={cn(
            'transition-transform duration-200',
            active ? 'scale-110 shadow-sm' : 'bg-surface-3 text-text-3'
          )} />
          {isPlaying && (
            <span className="absolute -right-0.5 -top-0.5 w-2.5 h-2.5 bg-primary rounded-full ring-2 ring-white animate-pulse" />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <header className="flex items-center gap-2 mb-1.5 h-5">
            <span className={cn(
              "text-[10px] font-black uppercase tracking-widest px-1.5 rounded-[4px] leading-relaxed",
              active ? "bg-primary text-white" : "bg-text-3/10 text-text-3"
            )}>
              {step.data?.context === 'desktop' ? 'desktop' : step.action}
            </span>
            <span className="text-[11px] text-text-2 font-mono truncate max-w-[140px] opacity-70">
              · {step.data?.context === 'desktop' ? '◎ Desktop Activity' : (step.elementText || 'Browser Tab')}
            </span>
            {step.textOverride && (
              <div className="w-1 h-1 rounded-full bg-primary ml-auto" title="Manually edited" />
            )}
          </header>
          
          {isEditing ? (
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  setIsEditing(false);
                  onUpdate(text);
                }
              }}
              onBlur={() => {
                setIsEditing(false);
                onUpdate(text);
              }}
              className="w-full bg-white border border-primary rounded-md p-3 text-[13.5px] text-text outline-none shadow-card-lifted resize-none leading-relaxed"
              rows={3}
            />
          ) : (
            <p 
              className={cn(
                "text-[13.5px] leading-[1.6] transition-all",
                text ? "text-text" : "text-text-3 italic font-medium"
              )}
              style={{ textWrap: 'pretty' as any }}
              onClick={(e) => {
                if (active) {
                  e.stopPropagation();
                  setIsEditing(true);
                }
              }}
            >
              {displayText(text) || 'Click to add a voiceover script for this step...'}
            </p>
          )}
        </div>
      </div>
      
      {active && !isEditing && (
        <div className="absolute top-1/2 -translate-y-1/2 right-3 flex items-center gap-0.5 bg-white border border-border shadow-card-lifted rounded-pill p-1 opacity-0 group-hover:opacity-100 transition-all scale-95 group-hover:scale-100 origin-right z-20">
          <Tooltip content="Edit Script">
            <IconButton 
              icon={I.Edit2} 
              label="Edit" 
              size={28} 
              onClick={(e) => { e.stopPropagation(); setIsEditing(true); }} 
            />
          </Tooltip>
          <Tooltip content="AI Regenerate">
            <IconButton 
              icon={isGenerating ? I.Loader : I.Sparkles} 
              label="AI" 
              size={28} 
              className={cn("text-primary hover:text-primary-700", isGenerating && "[&_svg]:animate-spin")} 
              onClick={handleRegenerate}
              disabled={isGenerating}
            />
          </Tooltip>
          <Tooltip content="Delete Step">
            <IconButton 
              icon={I.Trash2} 
              label="Delete" 
              size={28} 
              className="hover:text-danger hover:bg-danger/10" 
              onClick={(e) => { e.stopPropagation(); deleteStep(step.id); }} 
            />
          </Tooltip>
        </div>
      )}
    </div>
  );
};

// ─── Brand panel ───────────────────────────────────────────────────────
  export const BrandPanel: React.FC = () => {
  const brand = useStudioStore(state => state.brand);
  const setBrand = useStudioStore(state => state.setBrand);
    const [saved, setSaved] = React.useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const swatches = ['#5E5CE6','#0A84FF','#30D158','#FF9F0A','#FF453A','#BF5AF2','#FF375F','#1D1D1F'];
    const fonts = ['Inter','SF Pro','Geist','Söhne','Helvetica Neue'];

    const update = (updates: Parameters<typeof setBrand>[0]) => {
      setBrand(updates);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      update({ logoUrl: url });
    };

    return (
      <div className="h-full scroll-y px-5 py-5 space-y-7">

        {/* Saved indicator */}
        <AnimatePresence>
          {saved && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 text-[12px] text-green-600 font-medium"
            >
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
              Applied live
            </motion.div>
          )}
        </AnimatePresence>

        {/* Logo */}
        <section>
          <SectionLabel hint="PNG or SVG, up to 2 MB">Workspace logo</SectionLabel>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          {brand.logoUrl ? (
            <div className="relative grad-border h-24 flex items-center justify-center">
              <img src={brand.logoUrl} className="max-h-14 max-w-[160px] object-contain" />
              <button
                onClick={() => update({ logoUrl: null })}
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-surface-2 flex items-center justify-center text-text-2 hover:text-danger transition-colors"
              >
                <I.X size={12} />
              </button>
            </div>
          ) : (
            <div
              className="grad-border h-24 flex items-center justify-center cursor-pointer hover:bg-surface-2 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="text-center">
                <I.Upload size={20} className="text-primary mx-auto mb-1" strokeWidth={2} />
                <div className="text-[12.5px] font-medium text-text">Drop your logo</div>
                <div className="text-[11px] text-text-3">or click to browse</div>
              </div>
            </div>
          )}
        </section>

        {/* Primary color */}
        <section>
          <SectionLabel>Primary color</SectionLabel>
          <div className="flex items-center gap-2 mb-3">
            {swatches.map(c => (
              <button
                key={c}
                onClick={() => update({ primaryColor: c })}
                className={cn(
                  'relative w-8 h-8 rounded-full transition-transform hover:scale-110',
                  brand.primaryColor === c && 'ring-2 ring-offset-2 ring-text',
                )}
                style={{ background: c, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)' }}
              >
                {brand.primaryColor === c && (
                  <I.Check size={14} className="text-white absolute inset-0 m-auto" strokeWidth={3} />
                )}
              </button>
            ))}
          </div>
          <FieldShell icon={I.Type}>
            <span className="text-text-3 text-xs font-mono">HEX</span>
            <input
              value={brand.primaryColor}
              onChange={e => update({ primaryColor: e.target.value })}
              className="flex-1 bg-transparent outline-none text-sm font-mono"
            />
            <span className="w-5 h-5 rounded" style={{ background: brand.primaryColor }} />
          </FieldShell>
        </section>

        {/* Font */}
        <section>
          <SectionLabel>Font family</SectionLabel>
          <div className="space-y-1.5">
            {fonts.map(f => (
              <button
                key={f}
                onClick={() => update({ font: f })}
                className={cn(
                  'w-full flex items-center justify-between p-3 rounded-sm transition-colors text-left',
                  brand.font === f ? 'bg-primary-light ring-1 ring-primary/40' : 'bg-surface-2 hover:bg-[#E6E6EC]',
                )}
              >
                <div>
                  <div className="text-[13.5px] font-semibold text-text">{f}</div>
                  <div className="text-[18px] text-text-2 leading-tight mt-0.5">The quick brown fox</div>
                </div>
                {brand.font === f && <I.Check size={16} className="text-primary" />}
              </button>
            ))}
          </div>
        </section>

        {/* Slides */}
        <section>
          <SectionLabel>Slides</SectionLabel>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 rounded-sm bg-surface-2">
              <div>
                <div className="text-[13.5px] font-semibold text-text">Branded intro slide</div>
                <div className="text-[11.5px] text-text-2">Show before step 1</div>
              </div>
              <Toggle checked={brand.showIntro} onChange={v => update({ showIntro: v })} />
            </div>
            <div className="flex items-center justify-between p-3 rounded-sm bg-surface-2">
              <div>
                <div className="text-[13.5px] font-semibold text-text">Outro slide</div>
                <div className="text-[11.5px] text-text-2">Closing card with logo + CTA</div>
              </div>
              <Toggle checked={brand.showOutro} onChange={v => update({ showOutro: v })} />
            </div>
          </div>
        </section>

        {/* Watermark */}
        <section>
          <SectionLabel>Watermark</SectionLabel>
          <FieldShell icon={I.Type}>
            <input
              value={brand.watermark}
              onChange={e => update({ watermark: e.target.value })}
              placeholder="Watermark text"
              className="flex-1 bg-transparent outline-none text-sm"
            />
          </FieldShell>
        </section>

      </div>
    );
  };

// ─── Chapters panel ────────────────────────────────────────────────────
// ─── Chapters panel ────────────────────────────────────────────────────
export const ChaptersPanel: React.FC = () => {
  const session = useStudioStore(state => state.session);
  const saveChapterBreaks = useStudioStore(state => state.saveChapterBreaks);
  const focusedStepId = useStudioStore(state => state.focusedStepId);
  const currentStepIndex = useStudioStore(state => state.currentStepIndex);

  if (!session) return null;

  const chapters = session.metadata?.chapterBreaks || [];

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-4 border-b border-border">
        <SectionLabel hint={`${chapters.length} chapters`}>Auto-detected chapters</SectionLabel>
        <p className="text-[12.5px] text-text-2 leading-relaxed">
          We grouped the {session.metadata?.stepCount || session.steps?.length || 0} steps into chapters based on URL changes and action patterns.
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
        {chapters.map((c, i) => {
          const stepSequence = session.steps.find(s => s.id === c.afterStepId)?.sequence;
          return (
            <ChapterRow
              key={i}
              n={i + 2}
              title={c.chapterTitle}
              stepRange={stepSequence !== undefined ? `After step ${stepSequence}` : `After step ?`}
              onRename={(t) => {
                const next = [...chapters];
                next[i] = { ...c, chapterTitle: t };
                saveChapterBreaks(next);
              }}
              onDelete={() => {
                saveChapterBreaks(chapters.filter((_, j) => j !== i));
              }}
            />
          );
        })}

        <button
          onClick={() => {
            const targetStepId = focusedStepId || session.steps[currentStepIndex]?.id || session.steps[0]?.id;
            if (!targetStepId) return;

            // Check if there is already a chapter break after this step
            if (chapters.some(c => c.afterStepId === targetStepId)) {
              alert("A chapter break already exists for this step.");
              return;
            }

            const next = [...chapters, { afterStepId: targetStepId, chapterTitle: 'New Chapter' }];
            // Sort by step sequence/index chronologically
            const sorted = next.sort((a, b) => {
              const idxA = session.steps.findIndex(s => s.id === a.afterStepId);
              const idxB = session.steps.findIndex(s => s.id === b.afterStepId);
              return idxA - idxB;
            });
            saveChapterBreaks(sorted);
          }}
          className="w-full mt-3 h-10 rounded-sm border border-dashed border-border text-[13px] text-text-2 inline-flex items-center justify-center gap-2 hover:bg-surface-2 hover:text-text transition-colors"
        >
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

export { AudioPanel as AIVoicePanel } from './panels/AudioPanel';
export const MusicPanel: React.FC = () => (
  <ComingSoon title="Background Music" phase={3} description="Royalty-free tracks tuned to your walkthrough length. Auto-ducked under voiceovers." />
);
export const VisualsPanel: React.FC = () => (
  <ComingSoon title="Smart Visuals" phase={4} description="Auto-blur PII, swap backgrounds, beautify cursor paths, and apply screen recordings styling." />
);
export const ZoomsPanel: React.FC = () => {
  const session = useStudioStore(state => state.session);
  const focusedStepIndex = useStudioStore(state => state.focusedStepIndex);
  const updateStep = useStudioStore(state => state.updateStep);
  const saveAnimationTarget = useStudioStore(state => state.saveAnimationTarget);
  const currentStep = session?.steps[focusedStepIndex];
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!session || !currentStep) return null;

  const target = currentStep.animationTarget || {
    centerX: 50,
    centerY: 50,
    zoomScale: 1.0,
    transitionType: 'zoom',
    transitionDurationMs: 800
  };

  const updateTarget = (updates: Partial<typeof target>) => {
    const next = { ...target, ...updates };
    // Immediate in-memory update so preview responds instantly
    updateStep(currentStep.id, { animationTarget: next });
    // Debounced API persist
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveAnimationTarget(currentStep.id, next);
    }, 800);
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
          <SectionLabel hint={`${target.zoomScale.toFixed(2)}x`}>Zoom scale</SectionLabel>
          <input 
            type="range" min="1.0" max="1.4" step="0.05" 
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
              style={{ left: `${target.centerX ?? 50}%`, top: `${target.centerY ?? 50}%` }}
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
