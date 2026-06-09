import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useStudioStore } from '../../../store/useStudioStore';
import { apiClient } from '../../../lib/apiClient';
import { I } from '../../icons';
import { cn, Button, AIShimmer } from '../../ui';
import { stripAudioMarkers } from '../../../lib/textUtils';
import { showToast } from '../../GlobalToast';

// Credit cost for bulk narration (1 per step)
const NARRATION_CREDIT_PER_STEP = 1;

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

interface StepAudioStatus {
  stepId: string;
  voiceoverSource: 'original' | 'tts' | 'swap' | 'generating' | null;
  voiceoverKey: string | null;
  voiceoverDurationMs: number | null;
  swapVoiceId?: string | null;
  originalVoiceoverKey?: string | null;
  updatedAt?: number | null;
}

const ELEVENLABS_VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (Female - Standard)' },
  { id: '29vD33N1CtxCmqQRPOHJ', name: 'Drew (Male - News)' },
  { id: '2EiwWnXF2V4jofwvRnss', name: 'Clyde (Male - Deep)' },
  { id: 'piTKgcLEGmPEe24yT1vF', name: 'Nicole (Female - Whisper)' },
  { id: 'AZnzlk1Xgd1AawpnG3qV', name: 'Dom (Male - Strong)' },
];

// ─── Mini audio player per step ───────────────────────────────────────────────
const StepAudioRow: React.FC<{
  step: { id: string; sequence: number; stepTitle?: string | null; textOverride?: string; generatedText?: string; elementText?: string; url?: string; pageTitle?: string };
  status: StepAudioStatus | undefined;
  audioUrl: string | null;
  isPolling: boolean;
  sessionId: string;
  creditsBalance: number;
  onRefresh: () => void;
}> = ({ step, status, audioUrl, isPolling, sessionId, creditsBalance, onRefresh }) => {
  const [playing, setPlaying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isScriptOpen, setIsScriptOpen] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState(ELEVENLABS_VOICES[0].id);
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [localScript, setLocalScript] = useState(() => stripAudioMarkers(step.generatedText || ''));
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isGeneratingStepAudio, setIsGeneratingStepAudio] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const text = stripAudioMarkers(step.textOverride || step.generatedText) || step.elementText || '';

  // Sync localScript when generatedText changes externally (e.g. AI regen from another panel)
  const prevGeneratedText = useRef(step.generatedText);
  useEffect(() => {
    if (step.generatedText !== prevGeneratedText.current) {
      prevGeneratedText.current = step.generatedText;
      setLocalScript(stripAudioMarkers(step.generatedText || ''));
    }
  }, [step.generatedText]);

  const wordCount = localScript.trim() ? localScript.trim().split(/\s+/).length : 0;
  const approxSecs = Math.round((wordCount / 2.5) * 10) / 10;
  
  const done = status?.voiceoverSource === 'tts' || status?.voiceoverSource === 'original' || status?.voiceoverSource === 'swap';
  const generating = status?.voiceoverSource === 'generating' || isPolling || isSwapping;
  const isSwapped = !!status?.originalVoiceoverKey;

  async function handleRegenerateScript() {
    setIsGeneratingScript(true);
    setScriptError(null);
    try {
      const res = await apiClient.post<{ generatedText: string; stepTitle?: string; displayText?: string; budgetSeconds: number }>(
        `/sessions/${sessionId}/steps/${step.id}/generate-script`,
        { visualDurationSeconds: Math.max(wordCount / 2.5, 5) }
      );
      setLocalScript(res.generatedText);
      useStudioStore.getState().updateStep(step.id, {
        generatedText: res.generatedText,
        ...(res.stepTitle   ? { stepTitle:   res.stepTitle }   : {}),
        ...(res.displayText ? { displayText: res.displayText } : {}),
      } as any);
    } catch (e: any) {
      setScriptError(e.message || 'Failed to regenerate script');
    } finally {
      setIsGeneratingScript(false);
    }
  }

  async function persistScript(script: string) {
    if (!script.trim()) return;
    try {
      await apiClient.request(`/sessions/${sessionId}/steps/${step.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ generatedText: script }),
        headers: { 'Content-Type': 'application/json' },
      });
      useStudioStore.getState().updateStep(step.id, { generatedText: script } as any);
    } catch {
      // silent — user can retry by editing again
    }
  }

  async function handleGenerateStepAudio() {
    if (!localScript.trim()) return;
    setIsGeneratingStepAudio(true);
    setScriptError(null);
    try {
      await persistScript(localScript);
      await apiClient.post(`/sessions/${sessionId}/steps/${step.id}/generate-audio`, {
        text: localScript,
      });
      useStudioStore.getState().updateStep(step.id, {
        voiceoverSource: 'generating',
        voiceoverKey: null,
        voiceoverDurationMs: null,
      } as any);
      useStudioStore.getState().startAudioPolling(sessionId);
      onRefresh();
    } catch (e: any) {
      setScriptError(e.message || 'Failed to generate audio');
    } finally {
      setIsGeneratingStepAudio(false);
    }
  }

  function togglePlay() {
    const el = audioRef.current;
    if (!el || !audioUrl) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      setPlaying(true);
      el.play().catch((err) => {
        setPlaying(false);
        if (err.name !== 'AbortError') {
          console.error('[AudioPanel] Failed to play preview audio:', err);
        }
      });
    }
  }

  async function handleSwap() {
    console.log(`[AudioPanel][Swap Voice] Clicked Swap Voice for step ${step.id}. Selected voice: ${selectedVoice}`);
    if (generating) {
      console.log(`[AudioPanel][Swap Voice] Bailing out because step is currently generating.`);
      return;
    }
    setIsSwapping(true);
    setSwapError(null);
    useStudioStore.getState().updateStep(step.id, {
      voiceoverSource: 'generating',
      voiceoverKey: null,
      voiceoverDurationMs: null,
    } as any);
    try {
      console.log(`[AudioPanel][Swap Voice] Sending POST to /sessions/${sessionId}/steps/${step.id}/swap-voice with payload:`, { voiceId: selectedVoice });
      const res = await apiClient.post(`/sessions/${sessionId}/steps/${step.id}/swap-voice`, {
        voiceId: selectedVoice,
      });
      console.log(`[AudioPanel][Swap Voice] Successfully swapped voice. Server responded with:`, res);
      console.log(`[AudioPanel][Swap Voice] Calling onRefresh() to poll for updated audio URL.`);
      onRefresh();
    } catch (e: any) {
      console.error(`[AudioPanel][Swap Voice] Failed to swap voice. Error details:`, e);
      setSwapError(e.message || 'Failed to swap voice');
      setIsSwapping(false);
      onRefresh();
    }
  }

  async function handleRevert() {
    console.log(`[AudioPanel][Revert Voice] Clicked Revert for step ${step.id}`);
    if (generating) {
      console.log(`[AudioPanel][Revert Voice] Bailing out because step is currently generating.`);
      return;
    }
    setIsSwapping(true);
    setSwapError(null);
    useStudioStore.getState().updateStep(step.id, {
      voiceoverSource: 'generating',
      voiceoverKey: null,
      voiceoverDurationMs: null,
    } as any);
    try {
      console.log(`[AudioPanel][Revert Voice] Sending POST to /sessions/${sessionId}/steps/${step.id}/revert-audio`);
      const res = await apiClient.post(`/sessions/${sessionId}/steps/${step.id}/revert-audio`, {});
      console.log(`[AudioPanel][Revert Voice] Successfully reverted. Response:`, res);
      onRefresh();
      setIsSwapping(false);
      setIsExpanded(false);
    } catch (e: any) {
      console.error(`[AudioPanel][Revert Voice] Failed to revert. Error details:`, e);
      setSwapError(e.message || 'Failed to revert');
      setIsSwapping(false);
      onRefresh();
    }
  }

  // Auto-close expansion or reset swap loading when state changes
  useEffect(() => {
    if (generating) {
      setIsSwapping(false);
    }
  }, [generating]);

  // Clean up audio element on unmount to prevent background play & unhandled rejections
  useEffect(() => {
    return () => {
      const el = audioRef.current;
      if (el) {
        el.pause();
        el.removeAttribute('src');
        try {
          el.load();
        } catch (_) {}
      }
    };
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <div className={cn(
        'rounded-lg border px-3 py-2.5 flex items-center gap-2.5 transition-colors',
        done ? 'border-primary/20 bg-primary/5' : 'border-border bg-surface-2',
      )}>
        {/* Step badge */}
        <div className={cn(
          'w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0',
          done ? 'bg-primary/15 text-primary' : 'bg-surface-3 text-text-3',
        )}>
          {step.sequence}
        </div>

        {/* Step label: script text snippet, or fallback */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-text-1 line-clamp-2 leading-snug">
            {text || `Step ${step.sequence}`}
          </p>
        </div>

        {/* Edit script button — always visible */}
        <button
          onClick={() => { setIsScriptOpen(!isScriptOpen); setIsExpanded(false); }}
          className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center transition-colors shrink-0 text-text-3 hover:text-text-1 border border-transparent",
            isScriptOpen ? "bg-primary/20 text-primary border-primary/30" : "hover:bg-surface-3"
          )}
          title="Edit voiceover script"
        >
          <I.Pencil size={10} />
        </button>

        {/* State indicator */}
        {generating ? (
          <I.Loader size={13} className="text-primary animate-spin shrink-0" />
        ) : done && audioUrl ? (
          <>
            <audio
              ref={audioRef}
              src={audioUrl}
              onEnded={() => setPlaying(false)}
              className="hidden"
            />

            {/* Swapped indicator */}
            {status?.voiceoverSource === 'swap' && (
              <span className="text-[9px] bg-primary/10 text-primary border border-primary/25 px-1.5 py-0.5 rounded-full font-medium tracking-wide scale-90 select-none">
                Swapped
              </span>
            )}

            <button
              onClick={togglePlay}
              className="w-6 h-6 rounded-full bg-primary/15 hover:bg-primary/25 flex items-center justify-center transition-colors shrink-0"
              title={playing ? "Pause" : "Play"}
            >
              {playing
                ? <I.Pause size={10} className="text-primary" />
                : <I.Play size={10} className="text-primary" />}
            </button>

            {status?.voiceoverDurationMs && (
              <span className="text-[10px] text-text-3 shrink-0 tabular-nums mr-0.5">
                {formatDuration(status.voiceoverDurationMs)}
              </span>
            )}

            {/* Voice Swapping settings toggler */}
            <button
              onClick={() => { setIsExpanded(!isExpanded); setIsScriptOpen(false); }}
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center transition-colors shrink-0 text-text-3 hover:text-text-1 border border-transparent",
                isExpanded ? "bg-primary/20 text-primary border-primary/30" : "hover:bg-surface-3"
              )}
              title="Voice Swap Settings"
            >
              <I.Sparkles size={11} className={cn(status?.voiceoverSource === 'swap' && "animate-pulse")} />
            </button>
          </>
        ) : (
          <I.Circle size={8} className="text-text-3 shrink-0" />
        )}
      </div>

      {/* Script editor drawer */}
      {isScriptOpen && (
        <div
          className="mx-2 p-3 bg-surface-2 border border-border rounded-lg flex flex-col gap-2.5 animate-in slide-in-from-top-1 duration-150"
          onBlur={(e) => {
            // Close when focus leaves the entire drawer (not just the textarea)
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setIsScriptOpen(false);
            }
          }}
        >
          <div className="flex items-center gap-1.5">
            <I.Pencil size={12} className="text-primary" />
            <span className="text-[11px] font-semibold text-text-1">Voiceover Script</span>
            <span className="ml-auto text-[10px] text-text-3 tabular-nums">
              {wordCount} word{wordCount !== 1 ? 's' : ''} · ~{approxSecs}s
            </span>
          </div>

          {step.url && (() => {
            let host = '';
            try { host = new URL(step.url).hostname.replace(/^www\./, ''); } catch { host = step.url; }
            return (
              <a
                href={step.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 min-w-0 px-2 py-1 rounded-md bg-surface-3 border border-border hover:border-primary/40 transition-colors group"
                title={step.url}
              >
                <img
                  src={`https://www.google.com/s2/favicons?domain=${host}&sz=16`}
                  alt=""
                  width={12}
                  height={12}
                  className="rounded-sm shrink-0"
                />
                <span className="text-[10px] text-text-2 truncate group-hover:text-primary transition-colors">
                  {step.pageTitle || host}
                </span>
                <I.ExternalLink size={9} className="text-text-3 shrink-0 ml-auto group-hover:text-primary transition-colors" />
              </a>
            );
          })()}

          <textarea
            value={localScript}
            onChange={e => setLocalScript(e.target.value)}
            onBlur={() => persistScript(localScript)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                persistScript(localScript);
                setIsScriptOpen(false);
              }
            }}
            rows={3}
            className="w-full bg-surface-3 border border-border rounded-md px-2.5 py-2 text-[11px] text-text leading-relaxed resize-none focus:outline-none focus:border-primary transition-colors placeholder:text-text-3"
            placeholder="Enter voiceover script…"
            disabled={isGeneratingScript || isGeneratingStepAudio}
          />

          {scriptError && (
            <p className="text-[9px] text-danger font-medium flex items-center gap-1">
              <I.AlertCircle size={10} />
              {scriptError}
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={isGeneratingScript ? I.Loader : I.Sparkles}
              onClick={handleRegenerateScript}
              disabled={isGeneratingScript || isGeneratingStepAudio}
              className={cn(isGeneratingScript && '[&_svg]:animate-spin')}
            >
              {isGeneratingScript ? 'Regenerating…' : 'Regenerate Script'}
            </Button>

            <Button
              variant="primary"
              size="sm"
              icon={isGeneratingStepAudio ? I.Loader : I.Mic}
              onClick={handleGenerateStepAudio}
              disabled={isGeneratingScript || isGeneratingStepAudio || generating || !localScript.trim() || creditsBalance < 1}
              className={cn('ml-auto', isGeneratingStepAudio && '[&_svg]:animate-spin')}
              title={creditsBalance < 1 ? 'Not enough credits' : 'Generate audio for this step · 1 credit'}
            >
              {isGeneratingStepAudio ? 'Queuing…' : 'Generate Audio'}
            </Button>
          </div>

          {!isGeneratingScript && !isGeneratingStepAudio && creditsBalance < 1 && (
            <p className="text-[9px] text-text-3 text-center">
              Not enough credits to generate audio
            </p>
          )}
        </div>
      )}

      {/* Expanded drawer for Voice Swap */}
      {done && isExpanded && !generating && (
        <div className="mx-2 p-3 bg-surface-2 border border-border rounded-lg flex flex-col gap-2.5 animate-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-1.5">
            <I.Sparkles size={12} className="text-primary" />
            <span className="text-[11px] font-semibold text-text-1">Speech-to-Speech (Voice Swap)</span>
          </div>

          <p className="text-[10px] text-text-3 leading-relaxed">
            Re-synthesize this step's audio narration into a consistent voice while maintaining original pacing and emphasis.
          </p>

          <div className="flex items-center gap-2">
            <select
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              className="flex-1 bg-surface-3 border border-border rounded-md px-2 py-1 text-[11px] text-text font-medium focus:outline-none focus:border-primary transition-colors"
            >
              {ELEVENLABS_VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>

            <Button
              variant="primary"
              size="sm"
              onClick={handleSwap}
              disabled={generating}
              icon={I.Sparkles}
            >
              Swap Voice
            </Button>

            {isSwapped && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRevert}
                disabled={generating}
                title="Restore original audio"
              >
                <I.RotateCcw size={10} />
              </Button>
            )}
          </div>

          {swapError && (
            <p className="text-[9px] text-danger font-medium flex items-center gap-1 mt-0.5">
              <I.AlertCircle size={10} />
              {swapError}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main panel ───────────────────────────────────────────────────────────────
export const AudioPanel: React.FC = () => {
  const session = useStudioStore(s => s.session);
  const isAudioGenerating = useStudioStore(s => s.isAudioGenerating);
  const audioPollingStepIds = useStudioStore(s => s.audioPollingStepIds);
  const generateAllAudio = useStudioStore(s => s.generateAllAudio);
  const fetchNarrationStatus = useStudioStore(s => s.fetchNarrationStatus);
  const sessionStatus = useStudioStore(s => s.sessionStatus);
  const creditsBalance = useStudioStore(s => s.creditsBalance);
  const openCreditsModal = useStudioStore(s => s.setCreditsModalOpen);
  const isAiProcessing = useStudioStore(s => s.isAiProcessing);
  const triggerPipeline = useStudioStore(s => s.triggerPipeline);

  const sessionId = (session as any)?.id || (session as any)?.sessionId;

  // Derive step statuses directly from session.steps (always in sync via global store)
  const stepStatuses: StepAudioStatus[] = (session?.steps ?? []).map((s: any) => ({
    stepId: s.id,
    voiceoverSource: s.voiceoverSource ?? null,
    voiceoverKey: s.voiceoverKey ?? null,
    voiceoverDurationMs: s.voiceoverDurationMs ?? null,
    swapVoiceId: s.swapVoiceId ?? null,
    originalVoiceoverKey: s.originalVoiceoverKey ?? null,
    updatedAt: s.updatedAt ?? null,
  }));

  const [error, setError] = useState<string | null>(null);
  const [globalVoice, setGlobalVoice] = useState(ELEVENLABS_VOICES[0].id);
  const [hasInitializedVoice, setHasInitializedVoice] = useState(false);
  // Show a toast when the pipeline finishes from this panel's "Regenerate all" button
  const prevIsAiProcessingToast = useRef(false);
  useEffect(() => {
    if (prevIsAiProcessingToast.current && !isAiProcessing) {
      showToast('info', 'Narration scripts regenerated — regenerate voice to apply new audio');
    }
    prevIsAiProcessingToast.current = isAiProcessing;
  }, [isAiProcessing]);

  // Auto-initialize globalVoice from the first step that already has a swapVoiceId,
  // but only once — never overwrite a voice the user explicitly selected.
  const firstSwapVoiceId = stepStatuses.find(s => s.swapVoiceId)?.swapVoiceId ?? null;
  useEffect(() => {
    if (firstSwapVoiceId && !hasInitializedVoice) {
      setGlobalVoice(firstSwapVoiceId);
      setHasInitializedVoice(true);
    }
  // Depend on the stable string primitive, not the object-array reference
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstSwapVoiceId]);

  // ── Helpers ──
  const steps = session?.steps ?? [];
  // Use stripAudioMarkers() so [SILENCE] and trailing-... steps are excluded from
  // the narration count — the backend skips them anyway, so the UI should too.
  const stepsWithText = steps.filter(s => {
    const raw = stripAudioMarkers(s.textOverride || s.generatedText) || (s as any).elementText || '';
    return raw.trim().length > 0;
  });

  const audioUrl = useCallback((key: string | null | undefined) => {
    if (!key) return null;
    return session?.assets?.[key] ?? apiClient.getUrl(`/assets/${key}`);
  }, [session?.assets]);

  const generatingCount = stepStatuses.filter(s => s.voiceoverSource === 'generating').length;
  const doneCount = stepStatuses.filter(s =>
    s.voiceoverSource === 'tts' || s.voiceoverSource === 'original' || s.voiceoverSource === 'swap'
  ).length;
  const hasAnyAudio = doneCount > 0;
  const allDone = stepsWithText.length > 0 && doneCount === stepsWithText.length;

  // Fetch once on mount to pick up any already-completed audio that may not be in the R2 snapshot
  useEffect(() => {
    if (sessionId) fetchNarrationStatus(sessionId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // When "Regenerate all" is clicked from this panel, auto-trigger audio after script pipeline finishes.
  const pendingAudioAfterScript = useRef(false);
  const prevIsAiProcessing = useRef(isAiProcessing);
  useEffect(() => {
    if (prevIsAiProcessing.current && !isAiProcessing && pendingAudioAfterScript.current) {
      pendingAudioAfterScript.current = false;
      handleGenerateAll();
    }
    prevIsAiProcessing.current = isAiProcessing;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAiProcessing]);

  // ── Generate all ──
  async function handleGenerateAll() {
    console.log(`[AudioPanel][Regenerate AI Voice] Clicked Generate All. sessionId=${sessionId}, valid steps=${stepsWithText.length}`);
    if (!sessionId || stepsWithText.length === 0) return;
    setError(null);
    try {
      await generateAllAudio(sessionId, globalVoice);
    } catch (e: any) {
      setError(e.message || 'Failed to start generation');
    }
  }

  if (!session) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-3 text-sm">
        Loading session…
      </div>
    );
  }

  if (stepsWithText.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
        <I.Mic size={24} className="text-text-3" />
        <p className="text-[13px] font-medium text-text">No script available</p>
        <p className="text-[11px] text-text-3">
          Add text to your steps to enable AI voiceover generation.
        </p>
      </div>
    );
  }

  const activelyGenerating = generatingCount > 0 || isAudioGenerating;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 mb-0.5">
          <I.Mic size={14} className="text-primary" />
          <span className="text-[13px] font-semibold text-text">AI Voiceover</span>
          <button
            disabled={isAiProcessing}
            onClick={() => {
              pendingAudioAfterScript.current = true;
              triggerPipeline().catch((err: any) => {
                pendingAudioAfterScript.current = false;
                showToast('error', err?.message || 'AI generation failed');
              });
            }}
            className="ml-auto text-[11px] text-primary font-semibold inline-flex items-center gap-1 hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <I.Sparkles size={11} strokeWidth={2.4} className={cn(isAiProcessing && 'animate-spin')} />
            {isAiProcessing ? 'Regenerating...' : 'Regenerate all'}
          </button>
        </div>
        <p className="text-[11px] text-text-3 mt-0.5">
          Generates a natural AI voice for your entire recording
          {hasAnyAudio && (
            <span className="ml-1 text-[11px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-md font-medium">
              {doneCount}/{stepsWithText.length} steps
            </span>
          )}
        </p>
      </div>

      {/* ── Body ── */}
      <AIShimmer isActive={isAiProcessing} className="flex-1 min-h-0 overflow-hidden">
      <div className="h-full overflow-y-auto px-4 py-4 flex flex-col gap-3">

        {/* Generating state — shimmer banner */}
        {activelyGenerating && (
          <AIShimmer isActive className="rounded-lg overflow-hidden">
            <div className="rounded-lg bg-surface-2 border border-primary/20 p-3 flex items-center gap-3">
              <I.Loader size={16} className="text-primary animate-spin shrink-0" />
              <div>
                <p className="text-[12px] text-text font-medium">
                  Generating voiceover{generatingCount > 1 ? ` for ${generatingCount} steps` : ''}…
                </p>
                <p className="text-[10px] text-text-3 mt-0.5">Usually 10–30 s per step</p>
              </div>
            </div>
          </AIShimmer>
        )}

        {/* Success banner */}
        {allDone && !activelyGenerating && (
          <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2 flex items-center gap-2">
            <I.CheckCircle size={13} className="text-green-600 shrink-0" />
            <p className="text-[12px] text-green-700 font-medium">
              All steps have AI voiceover — ready for cinematic export
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-danger/10 border border-danger/20 px-3 py-2 flex items-center gap-2">
            <I.AlertCircle size={13} className="text-danger shrink-0" />
            <p className="text-[12px] text-danger">{error}</p>
          </div>
        )}

        {/* Step list */}
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium text-text-3 uppercase tracking-wide">
            Steps · {stepsWithText.length} to narrate
          </p>
          {stepsWithText.map(step => {
            const status = stepStatuses.find(s => s.stepId === step.id);
            const url = audioUrl(status?.voiceoverKey);
            return (
              <StepAudioRow
                key={step.id}
                step={step as any}
                status={status}
                audioUrl={url}
                isPolling={audioPollingStepIds.includes(step.id)}
                sessionId={sessionId}
                creditsBalance={creditsBalance}
                onRefresh={() => fetchNarrationStatus(sessionId)}
              />
            );
          })}
        </div>
      </div>
      </AIShimmer>

      {/* ── Footer CTA ── */}
      <div className="px-4 pb-4 pt-2 border-t border-border shrink-0 flex flex-col gap-2.5">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-text-3 uppercase tracking-wider">
            Narrator Voice (Global)
          </label>
          <select
            value={globalVoice}
            onChange={(e) => { setGlobalVoice(e.target.value); setHasInitializedVoice(true); }}
            disabled={activelyGenerating}
            className="w-full bg-surface-3 border border-border rounded-md px-2.5 py-1.5 text-[11px] text-text font-medium focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
          >
            {ELEVENLABS_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>

        {(() => {
          const cost = stepsWithText.length * NARRATION_CREDIT_PER_STEP;
          const insufficient = creditsBalance < cost && !activelyGenerating;
          if (insufficient) {
            return (
              <>
                <Button variant="primary" size="sm" icon={I.Sparkles} disabled className="w-full opacity-50">
                  {hasAnyAudio ? 'Regenerate AI Voice' : `Generate AI Voice · ${stepsWithText.length} step${stepsWithText.length !== 1 ? 's' : ''}`}
                </Button>
                <p className="text-[10px] text-center text-text-3">
                  Not enough credits —{' '}
                  <button onClick={() => openCreditsModal(true)} className="text-primary underline underline-offset-2">top up to continue</button>
                </p>
              </>
            );
          }
          return (
            <>
              <Button
                variant="primary"
                size="sm"
                icon={activelyGenerating ? I.Loader : I.Sparkles}
                disabled={activelyGenerating || stepsWithText.length === 0}
                onClick={handleGenerateAll}
                className={cn('w-full', activelyGenerating && '[&_svg]:animate-spin')}
              >
                {activelyGenerating
                  ? `Generating ${generatingCount > 0 ? `(${generatingCount} remaining)` : ''}…`
                  : hasAnyAudio
                    ? 'Regenerate AI Voice'
                    : `Generate AI Voice · ${stepsWithText.length} step${stepsWithText.length !== 1 ? 's' : ''}`}
              </Button>
              {!activelyGenerating && (
                <p className="text-[10px] text-text-3 text-center">
                  Uses {cost} credit{cost !== 1 ? 's' : ''} — {creditsBalance} remaining
                </p>
              )}
            </>
          );
        })()}

        {/* Stale audio warning — shown after AI text was just regenerated */}
        {hasAnyAudio && !activelyGenerating && sessionStatus === 'ready' && (
          <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg px-3 py-2">
            <I.AlertTriangle size={12} className="text-warning shrink-0 mt-0.5" />
            <p className="text-[10px] text-warning leading-relaxed">
              Script was updated — regenerate voice so audio matches your new narration.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
