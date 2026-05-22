const sessionId = 'd384eddb-c5a3-469f-aac8-9cab98ca7740';
const url = `https://studiobase-backend.karthik-upadhyay98.workers.dev/v1/public/${sessionId}/json`;

// Constants from PlayerTimeline
const DEFAULT_STEP_MS = 5000;
const MIN_STEP_MS = 1000;

async function run() {
  console.log(`Fetching live session JSON from ${url}...`);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`HTTP Error: ${res.status}`);
    return;
  }
  const data = await res.json();
  
  const steps = data.steps || [];
  const sessionStartMs = data.sessionStartMs || (steps[0] ? steps[0].timestamp : 0) || 0;
  
  // Check if we have a videoUrl/videoKey
  const videoKey = data.videoKey || (data.assets && data.assets.video);
  const videoUrl = videoKey ? (data.assets && data.assets[videoKey]) : null;
  const hasVideo = !!videoKey;
  console.log(`Session properties:`);
  console.log(`  sessionStartMs: ${sessionStartMs}`);
  console.log(`  videoKey: ${videoKey}`);
  console.log(`  hasVideo: ${hasVideo}`);
  console.log(`  chapterBreaks:`, JSON.stringify(data.metadata?.chapterBreaks || []));
  console.log(`\nCompiling timeline using useVideoTimestamps = ${hasVideo}...`);
  
  const MIN_PLAYBACK_RATES = {
    navigate: 0.6,
    type: 0.75,
    click: 0.85,
    camera_pan: 0.5,
    default: 0.7
  };

  // Re-implement getRelativeMs and buildTimeline exactly
  const getRelativeMs = (step) => {
    const raw = step.timestamp || 0;
    const EPOCH_FLOOR = 1_000_000_000_000;
    return raw > EPOCH_FLOOR ? Math.max(0, raw - sessionStartMs) : raw;
  };

  const segments = [];
  const videoTrack = { clips: [] };
  const audioTrack = { clips: [] };
  let cursor = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const audioDuration = step.voiceoverDurationMs != null && step.voiceoverDurationMs > 0
      ? step.voiceoverDurationMs
      : (hasVideo ? 0 : DEFAULT_STEP_MS);

    let visualDuration = 0;
    const startSourceMs = hasVideo ? (i === 0 ? 0 : getRelativeMs(step)) : 0;

    if (hasVideo) {
      if (i < steps.length - 1) {
        const nextSourceMs = getRelativeMs(steps[i + 1]);
        visualDuration = Math.max(0, nextSourceMs - startSourceMs);
      } else {
        visualDuration = audioDuration > 0 ? audioDuration : DEFAULT_STEP_MS;
      }
    } else {
      visualDuration = audioDuration;
    }

    // Stretch + Hold Calculation
    let resolvedDuration = Math.max(visualDuration, audioDuration);
    let playbackRate = 1.0;
    let actionClipDuration = visualDuration;
    let holdClipDuration = 0;

    if (hasVideo && visualDuration > 0 && audioDuration > visualDuration) {
      const actionType = step.action || 'default';
      const minPlaybackRate = MIN_PLAYBACK_RATES[actionType] ?? MIN_PLAYBACK_RATES.default;
      const maxStretchedVisualMs = visualDuration / minPlaybackRate;

      if (audioDuration <= maxStretchedVisualMs) {
        playbackRate = visualDuration / audioDuration;
        actionClipDuration = audioDuration;
        holdClipDuration = 0;
        resolvedDuration = audioDuration;
      } else {
        playbackRate = minPlaybackRate;
        actionClipDuration = maxStretchedVisualMs;
        holdClipDuration = audioDuration - maxStretchedVisualMs;
        resolvedDuration = audioDuration;
      }
    } else if (visualDuration <= 0) {
      actionClipDuration = 0;
      holdClipDuration = resolvedDuration;
    }

    // Audio Track clips
    if (audioDuration > 0) {
      audioTrack.clips.push({
        stepIndex: i,
        logicalStartMs: cursor,
        logicalDurationMs: audioDuration,
        sourceStartMs: 0,
        type: 'action',
      });
    }

    // Video Track clips
    if (actionClipDuration > 0) {
      videoTrack.clips.push({
        stepIndex: i,
        logicalStartMs: cursor,
        logicalDurationMs: actionClipDuration,
        sourceStartMs: startSourceMs,
        type: 'action',
        playbackRate,
      });
    }

    if (holdClipDuration > 0) {
      videoTrack.clips.push({
        stepIndex: i,
        logicalStartMs: cursor + actionClipDuration,
        logicalDurationMs: holdClipDuration,
        sourceStartMs: Math.max(0, startSourceMs + visualDuration - 1),
        type: 'hold',
      });
    }

    // Chapter Breaks
    const chapterBefore = data.metadata?.chapterBreaks?.find(c => c.afterStepId === (steps[i - 1]?.id))?.chapterTitle || null;
    const chapterAfter = data.metadata?.chapterBreaks?.find(c => c.afterStepId === step.id)?.chapterTitle || null;

    segments.push({
      stepIndex: i,
      id: step.id,
      action: step.action || 'none',
      timestamp: step.timestamp,
      relativeStartMs: startSourceMs,
      relativeEndMs: hasVideo ? (i < steps.length - 1 ? getRelativeMs(steps[i + 1]) : startSourceMs + visualDuration) : (startSourceMs + visualDuration),
      visualDuration,
      audioSource: step.voiceoverSource || 'none',
      audioKey: step.voiceoverKey || 'none',
      audioDuration,
      resolvedDuration,
      playbackRate,
      hasHold: holdClipDuration > 0,
      holdDuration: holdClipDuration,
      chapterBefore,
      chapterAfter,
      logicalStartMs: cursor,
      logicalEndMs: cursor + resolvedDuration
    });

    cursor += resolvedDuration;
  }

  // Print results
  console.log(`\nTiming Data Per Step:`);
  console.log(JSON.stringify(segments, null, 2));
}

run();
