import React, { useEffect, useRef, useState } from 'react';
import { useStudioStore } from '../../../store/useStudioStore';
import { I } from '../../icons';
import { cn, Button, AIShimmer } from '../../ui';

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export const AudioPanel: React.FC = () => {
  const session = useStudioStore(s => s.session);
  const focusedStepId = useStudioStore(s => s.focusedStepId);
  const audioPollingStepId = useStudioStore(s => s.audioPollingStepId);
  const generateAudio = useStudioStore(s => s.generateAudio);
  const revertAudio = useStudioStore(s => s.revertAudio);
  const pollAudioStatus = useStudioStore(s => s.pollAudioStatus);
  const patchAudioDuration = useStudioStore(s => s.patchAudioDuration);

  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const step = session?.steps.find(s => s.id === focusedStepId);
  const sessionId = (session as any)?.id || (session as any)?.sessionId;
  const stepText = step?.textOverride || step?.generatedText || step?.elementText || '';
  const voiceoverSource = (step as any)?.voiceoverSource as string | null | undefined;
  const voiceoverKey = step?.voiceoverKey;
  const voiceoverDurationMs = step?.voiceoverDurationMs;
  const isGeneratingThis = audioPollingStepId === focusedStepId;
  const audioUrl = voiceoverKey ? session?.assets?.[voiceoverKey] : null;
  const hasAudio = voiceoverSource === 'tts' || voiceoverSource === 'original';
  const canRevert = hasAudio && (step as any)?.originalVoiceoverKey;

  // ── Polling ──
  useEffect(() => {
    if (isGeneratingThis && sessionId && focusedStepId) {
      pollRef.current = setInterval(async () => {
        try {
          await pollAudioStatus(sessionId, focusedStepId);
        } catch {
          // silent — next tick will retry
        }
      }, 2000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isGeneratingThis, sessionId, focusedStepId, pollAudioStatus]);

  // ── Web Speech preview ──
  function handlePreview() {
    if (!stepText || !('speechSynthesis' in window)) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const utt = new SpeechSynthesisUtterance(stepText);
    utt.onend = () => setIsSpeaking(false);
    utt.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utt);
    setIsSpeaking(true);
  }

  async function handleGenerate() {
    if (!sessionId || !focusedStepId || !stepText) return;
    setError(null);
    try {
      await generateAudio(sessionId, focusedStepId, stepText);
    } catch (e: any) {
      setError(e.message || 'Generation failed');
    }
  }

  async function handleRevert() {
    if (!sessionId || !focusedStepId) return;
    setError(null);
    try {
      await revertAudio(sessionId, focusedStepId);
    } catch (e: any) {
      setError(e.message || 'Revert failed');
    }
  }

  function handleAudioLoad() {
    const el = audioRef.current;
    if (!el || !sessionId || !focusedStepId) return;
    // Use accurate browser-measured duration
    if (isFinite(el.duration) && el.duration > 0) {
      patchAudioDuration(sessionId, focusedStepId, Math.round(el.duration * 1000));
    }
    el.addEventListener('durationchange', () => {
      if (isFinite(el.duration) && el.duration > 0) {
        patchAudioDuration(sessionId, focusedStepId, Math.round(el.duration * 1000));
      }
    }, { once: true });
  }

  if (!step) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-3 text-sm">
        Select a step to manage its voiceover
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 mb-0.5">
          <I.Mic size={14} className="text-primary" />
          <span className="text-[13px] font-semibold text-text">AI Voiceover</span>
          {voiceoverDurationMs && (
            <span className="ml-auto text-[11px] text-text-3">{formatDuration(voiceoverDurationMs)}</span>
          )}
        </div>
        <p className="text-[11px] text-text-3 mt-0.5">Step {step.sequence}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {/* Script preview */}
        <div className="rounded-lg bg-surface-2 border border-border p-3">
          <p className="text-[12px] text-text-2 font-medium mb-1">Script</p>
          <p className="text-[13px] text-text leading-relaxed line-clamp-4">
            {stepText || <span className="text-text-3 italic">No script text for this step</span>}
          </p>
          {stepText && (
            <button
              onClick={handlePreview}
              className={cn(
                'mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium transition-colors',
                isSpeaking ? 'text-primary' : 'text-text-3 hover:text-text',
              )}
            >
              {isSpeaking ? <I.Pause size={12} /> : <I.Play size={12} />}
              {isSpeaking ? 'Stop preview' : 'Preview with system voice'}
            </button>
          )}
        </div>

        {/* State: generating */}
        {isGeneratingThis && (
          <AIShimmer isActive className="rounded-lg overflow-hidden">
            <div className="rounded-lg bg-surface-2 border border-primary/20 p-4 flex flex-col items-center gap-2">
              <I.Loader size={20} className="text-primary animate-spin" />
              <p className="text-[13px] text-text font-medium">Generating voiceover…</p>
              <p className="text-[11px] text-text-3">Usually takes 10–30 seconds</p>
            </div>
          </AIShimmer>
        )}

        {/* State: ready — audio player */}
        {hasAudio && !isGeneratingThis && audioUrl && (
          <div className="rounded-lg bg-surface-2 border border-border p-3 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <I.Headphones size={14} className="text-primary shrink-0" />
              <span className="text-[12px] font-medium text-text">
                {voiceoverSource === 'tts' ? 'AI Generated' : 'Original Recording'}
              </span>
              {voiceoverDurationMs && (
                <span className="ml-auto text-[11px] text-text-3">{formatDuration(voiceoverDurationMs)}</span>
              )}
            </div>
            <audio
              ref={audioRef}
              src={audioUrl}
              controls
              onLoadedMetadata={handleAudioLoad}
              className="w-full h-8"
              style={{ accentColor: 'var(--color-primary)' }}
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-danger/10 border border-danger/20 px-3 py-2 flex items-center gap-2">
            <I.AlertCircle size={14} className="text-danger shrink-0" />
            <p className="text-[12px] text-danger">{error}</p>
          </div>
        )}
      </div>

      {/* Footer actions */}
      {!isGeneratingThis && (
        <div className="px-4 pb-4 pt-2 border-t border-border shrink-0 flex flex-col gap-2">
          <Button
            variant="primary"
            size="sm"
            icon={I.Sparkles}
            disabled={!stepText}
            onClick={handleGenerate}
            className="w-full"
          >
            {hasAudio ? 'Regenerate Voiceover' : 'Generate Voiceover'}
          </Button>
          {canRevert && (
            <Button
              variant="ghost"
              size="sm"
              icon={I.RotateCcw}
              onClick={handleRevert}
              className="w-full"
            >
              Revert to Original
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
