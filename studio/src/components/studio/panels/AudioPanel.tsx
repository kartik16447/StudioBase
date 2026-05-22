import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useStudioStore } from '../../../store/useStudioStore';
import { apiClient } from '../../../lib/apiClient';
import { I } from '../../icons';
import { cn, Button, AIShimmer } from '../../ui';

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
  step: { id: string; sequence: number; textOverride?: string; generatedText?: string; elementText?: string };
  status: StepAudioStatus | undefined;
  audioUrl: string | null;
  isPolling: boolean;
  sessionId: string;
  onRefresh: () => void;
}> = ({ step, status, audioUrl, isPolling, sessionId, onRefresh }) => {
  const [playing, setPlaying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState(ELEVENLABS_VOICES[0].id);
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const text = step.textOverride || step.generatedText || step.elementText || '';
  
  const done = status?.voiceoverSource === 'tts' || status?.voiceoverSource === 'original' || status?.voiceoverSource === 'swap';
  const generating = status?.voiceoverSource === 'generating' || isPolling || isSwapping;
  const isSwapped = !!status?.originalVoiceoverKey;

  function togglePlay() {
    const el = audioRef.current;
    if (!el || !audioUrl) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.play(); setPlaying(true); }
  }

  async function handleSwap() {
    console.log(`[AudioPanel][Swap Voice] Clicked Swap Voice for step ${step.id}. Selected voice: ${selectedVoice}`);
    if (generating) {
      console.log(`[AudioPanel][Swap Voice] Bailing out because step is currently generating.`);
      return;
    }
    setIsSwapping(true);
    setSwapError(null);
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
    }
  }

  // Auto-close expansion or reset swap loading when state changes
  useEffect(() => {
    if (generating) {
      setIsSwapping(false);
    }
  }, [generating]);

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

        {/* Script snippet */}
        <p className="flex-1 text-[11px] text-text-2 line-clamp-1 min-w-0">
          {text || <span className="text-text-3 italic">No script</span>}
        </p>

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
              onClick={() => setIsExpanded(!isExpanded)}
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
  const sessionId = (session as any)?.id || (session as any)?.sessionId;

  // Per-step audio statuses fetched from /narration-status
  const [stepStatuses, setStepStatuses] = useState<StepAudioStatus[]>(() => {
    if (!session?.steps) return [];
    return session.steps.map(s => ({
      stepId: s.id,
      voiceoverSource: (s as any).voiceoverSource ?? null,
      voiceoverKey: s.voiceoverKey ?? null,
      voiceoverDurationMs: s.voiceoverDurationMs ?? null,
      swapVoiceId: (s as any).swapVoiceId ?? null,
      originalVoiceoverKey: (s as any).originalVoiceoverKey ?? null,
    }));
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollingStepIds, setPollingStepIds] = useState<Set<string>>(new Set());
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [globalVoice, setGlobalVoice] = useState(ELEVENLABS_VOICES[0].id);
  const [hasInitializedVoice, setHasInitializedVoice] = useState(false);

  useEffect(() => {
    if (stepStatuses.length > 0 && !hasInitializedVoice) {
      const firstWithVoice = stepStatuses.find(s => s.swapVoiceId);
      if (firstWithVoice?.swapVoiceId) {
        setGlobalVoice(firstWithVoice.swapVoiceId);
        setHasInitializedVoice(true);
      }
    }
  }, [stepStatuses, hasInitializedVoice]);

  // ── Helpers ──
  const steps = session?.steps ?? [];
  const stepsWithText = steps.filter(s =>
    (s.textOverride || s.generatedText || (s as any).elementText || '').trim()
  );

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

  // ── Load narration status on mount ──
  const loadStatus = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data = await apiClient.get<{ steps: StepAudioStatus[] }>(
        `/sessions/${sessionId}/narration-status`
      );
      setStepStatuses(data.steps ?? []);

      // Sync to global store if there are changes
      const currentSession = useStudioStore.getState().session;
      if (currentSession?.steps) {
        let sessionChanged = false;
        const updatedSteps = currentSession.steps.map(step => {
          const status = (data.steps ?? []).find(s => s.stepId === step.id);
          if (!status) return step;

          const voiceoverKeyChanged = status.voiceoverKey !== step.voiceoverKey;
          const voiceoverSourceChanged = status.voiceoverSource !== (step as any).voiceoverSource;
          const durationChanged = status.voiceoverDurationMs !== step.voiceoverDurationMs;
          const originalKeyChanged = status.originalVoiceoverKey !== (step as any).originalVoiceoverKey;
          const updatedAtChanged = status.updatedAt !== (step as any).updatedAt;

          if (voiceoverKeyChanged || voiceoverSourceChanged || durationChanged || originalKeyChanged || updatedAtChanged) {
            sessionChanged = true;
            return {
              ...step,
              voiceoverKey: status.voiceoverKey,
              voiceoverSource: status.voiceoverSource,
              voiceoverDurationMs: status.voiceoverDurationMs,
              originalVoiceoverKey: status.originalVoiceoverKey,
              updatedAt: status.updatedAt,
            };
          }
          return step;
        });

        if (sessionChanged) {
          console.log('[AudioPanel] Syncing updated narration status to global store.');
          const updatedAssets = { ...(currentSession.assets ?? {}) };
          for (const step of updatedSteps) {
            if (step.voiceoverKey) {
              const t = (step as any).updatedAt || Date.now();
              updatedAssets[step.voiceoverKey] = apiClient.getUrl(`/assets/${step.voiceoverKey}?t=${t}`);
            }
            if ((step as any).originalVoiceoverKey) {
              const t = (step as any).updatedAt || Date.now();
              updatedAssets[(step as any).originalVoiceoverKey] = apiClient.getUrl(`/assets/${(step as any).originalVoiceoverKey}?t=${t}`);
            }
          }
          useStudioStore.setState({
            session: {
              ...currentSession,
              steps: updatedSteps,
              assets: updatedAssets,
            }
          });
        }
      }

      // Update pollingStepIds based on what's still generating
      const stillGenerating = new Set(
        (data.steps ?? [])
          .filter(s => s.voiceoverSource === 'generating')
          .map(s => s.stepId)
      );
      setPollingStepIds(stillGenerating);

      if (stillGenerating.size === 0) {
        setIsGenerating(false);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
    } catch { /* silent */ }
  }, [sessionId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Keep stepStatuses in sync with session.steps to prevent flash on initial load
  const prevStepsRef = useRef<any>(null);
  useEffect(() => {
    if (session?.steps && session.steps !== prevStepsRef.current) {
      prevStepsRef.current = session.steps;
      setStepStatuses(session.steps.map(s => ({
        stepId: s.id,
        voiceoverSource: (s as any).voiceoverSource ?? null,
        voiceoverKey: s.voiceoverKey ?? null,
        voiceoverDurationMs: s.voiceoverDurationMs ?? null,
        swapVoiceId: (s as any).swapVoiceId ?? null,
        originalVoiceoverKey: (s as any).originalVoiceoverKey ?? null,
      })));
    }
  }, [session?.steps]);

  // ── Poll while generating ──
  useEffect(() => {
    if (pollingStepIds.size > 0 && !pollIntervalRef.current) {
      pollIntervalRef.current = setInterval(loadStatus, 2500);
    }
    return () => {
      if (pollIntervalRef.current && pollingStepIds.size === 0) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [pollingStepIds.size, loadStatus]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
  }, []);

  // ── Generate all ──
  async function handleGenerateAll() {
    console.log(`[AudioPanel][Regenerate AI Voice] Clicked Generate All. sessionId=${sessionId}, valid steps=${stepsWithText.length}`);
    if (!sessionId || stepsWithText.length === 0) {
      console.log(`[AudioPanel][Regenerate AI Voice] Bailing out because no session or no valid steps with text.`);
      return;
    }
    setError(null);
    setIsGenerating(true);
    try {
      console.log(`[AudioPanel][Regenerate AI Voice] Sending POST to /sessions/${sessionId}/generate-narration with voiceId: ${globalVoice}`);
      const result = await apiClient.post<{ queued: string[]; totalCost: number }>(
        `/sessions/${sessionId}/generate-narration`,
        { voiceId: globalVoice }
      );
      console.log(`[AudioPanel][Regenerate AI Voice] Server accepted request. Response data (queued steps to update UI):`, result);
      // Mark queued steps as generating locally for immediate feedback
      setStepStatuses(prev => {
        const map = new Map(prev.map(s => [s.stepId, s]));
        for (const id of result.queued) {
          map.set(id, { stepId: id, voiceoverSource: 'generating', voiceoverKey: null, voiceoverDurationMs: null });
        }
        return [...map.values()];
      });
      setPollingStepIds(new Set(result.queued));
      // Start polling
      if (!pollIntervalRef.current) {
        pollIntervalRef.current = setInterval(loadStatus, 2500);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to start generation');
      setIsGenerating(false);
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

  const activelyGenerating = generatingCount > 0 || (isGenerating && pollingStepIds.size > 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 mb-0.5">
          <I.Mic size={14} className="text-primary" />
          <span className="text-[13px] font-semibold text-text">AI Voiceover</span>
          {hasAnyAudio && (
            <span className="ml-auto text-[11px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-md font-medium">
              {doneCount}/{stepsWithText.length} steps
            </span>
          )}
        </div>
        <p className="text-[11px] text-text-3 mt-0.5">
          Generates a natural AI voice for your entire recording
        </p>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">

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
                isPolling={pollingStepIds.has(step.id)}
                sessionId={sessionId}
                onRefresh={loadStatus}
              />
            );
          })}
        </div>
      </div>

      {/* ── Footer CTA ── */}
      <div className="px-4 pb-4 pt-2 border-t border-border shrink-0 flex flex-col gap-2.5">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold text-text-3 uppercase tracking-wider">
            Narrator Voice (Global)
          </label>
          <select
            value={globalVoice}
            onChange={(e) => setGlobalVoice(e.target.value)}
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
        {hasAnyAudio && !activelyGenerating && (
          <p className="text-[10px] text-text-3 text-center">
            {stepsWithText.length} credit{stepsWithText.length !== 1 ? 's' : ''} to regenerate all
          </p>
        )}
      </div>
    </div>
  );
};
