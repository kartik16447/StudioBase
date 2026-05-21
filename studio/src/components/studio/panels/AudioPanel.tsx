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
  voiceoverSource: string | null;
  voiceoverKey: string | null;
  voiceoverDurationMs: number | null;
}

// ─── Mini audio player per step ───────────────────────────────────────────────
const StepAudioRow: React.FC<{
  step: { id: string; sequence: number; textOverride?: string; generatedText?: string; elementText?: string };
  status: StepAudioStatus | undefined;
  audioUrl: string | null;
  isPolling: boolean;
}> = ({ step, status, audioUrl, isPolling }) => {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const text = step.textOverride || step.generatedText || step.elementText || '';
  const done = status?.voiceoverSource === 'tts' || status?.voiceoverSource === 'original';
  const generating = status?.voiceoverSource === 'generating' || isPolling;

  function togglePlay() {
    const el = audioRef.current;
    if (!el || !audioUrl) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.play(); setPlaying(true); }
  }

  return (
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
          <button
            onClick={togglePlay}
            className="w-6 h-6 rounded-full bg-primary/15 hover:bg-primary/25 flex items-center justify-center transition-colors shrink-0"
          >
            {playing
              ? <I.Pause size={10} className="text-primary" />
              : <I.Play size={10} className="text-primary" />}
          </button>
          {status?.voiceoverDurationMs && (
            <span className="text-[10px] text-text-3 shrink-0 tabular-nums">
              {formatDuration(status.voiceoverDurationMs)}
            </span>
          )}
        </>
      ) : (
        <I.Circle size={8} className="text-text-3 shrink-0" />
      )}
    </div>
  );
};

// ─── Main panel ───────────────────────────────────────────────────────────────
export const AudioPanel: React.FC = () => {
  const session = useStudioStore(s => s.session);
  const sessionId = (session as any)?.id || (session as any)?.sessionId;

  // Per-step audio statuses fetched from /narration-status
  const [stepStatuses, setStepStatuses] = useState<StepAudioStatus[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollingStepIds, setPollingStepIds] = useState<Set<string>>(new Set());
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    s.voiceoverSource === 'tts' || s.voiceoverSource === 'original'
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
    if (!sessionId || stepsWithText.length === 0) return;
    setError(null);
    setIsGenerating(true);
    try {
      const result = await apiClient.post<{ queued: string[]; totalCost: number }>(
        `/sessions/${sessionId}/generate-narration`,
        {}
      );
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
              />
            );
          })}
        </div>
      </div>

      {/* ── Footer CTA ── */}
      <div className="px-4 pb-4 pt-2 border-t border-border shrink-0 flex flex-col gap-2">
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
