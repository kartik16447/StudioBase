export const RenderConstants = {
  PANEL_WIDTH: 480,
  SOP_MAX_WIDTH: 860,
  GLOW_RADIUS: 500,
  ASSET_REFRESH_INTERVAL: 15 * 60 * 1000,
  PLAYER_MAX_HEIGHT: 'calc(100vh - 280px)',
  PLAYER_ASPECT_RATIO: '16/9',

  // Export: standard 1080p HD — balances quality and render speed.
  // 4K (2880x1444) was the previous value and caused 5-10 min export times
  // because software-decoded frames had to be composited at that resolution.
  EXPORT_COMPOSITOR_WIDTH: 1920,
  EXPORT_COMPOSITOR_HEIGHT: 1080,
  EXPORT_VISUAL_WIDTH: '192px',
  EXPORT_VISUAL_HEIGHT: '108px',
  EXPORT_VIDEO_BITRATE: 16000000, // 16 Mbps — plenty for 1080p60
  EXPORT_FPS: 60,

  // Preview internal render resolution (CSS will scale it down)
  PREVIEW_WIDTH: 1920,
  PREVIEW_HEIGHT: 1080,

  GRID_SPACING: 60,

  // How much padding around the screenshot at zoom=1 (fraction of canvas dimension)
  SCREENSHOT_PADDING: 0.005,

  PANEL_SPRING: { type: 'spring' as const, stiffness: 280, damping: 36 },

  // Cinematic camera springs — tuned for human eye tracking behaviour.
  //
  // Cognitive science basis:
  //   The human eye needs ~400–600 ms to re-orient after a pan.  A spring that
  //   settles in ~1.2 s (old values) is too fast — it chases the target so
  //   eagerly that the viewer never gets a still frame to read the element.
  //
  // XY (pan):   stiffness 28, damping 32, mass 1.8 → settles ~2.0 s, no bounce
  //             Heavier than before — the camera "commits" to a position and
  //             holds it instead of constantly chasing the next target.
  //
  // Scale (zoom): stiffness 18, damping 28, mass 2.2 → settles ~2.8 s
  //             Zoom should be noticeably SLOWER than pan.  Human perception
  //             treats them as separate cognitive channels — a fast zoom while
  //             panning overloads the vestibular system (motion-sickness cue).
  CAMERA_XY_SPRING:    { stiffness: 28, damping: 32, mass: 1.8, restDelta: 0.001 },
  CAMERA_SCALE_SPRING: { stiffness: 18, damping: 28, mass: 2.2, restDelta: 0.001 },

  // Hard zoom scale limits — keeps the view readable, prevents tunnel-vision
  CAMERA_SCALE_LIMITS: {
    min:   1.0,   // full overview — whole screenshot visible
    near:  1.04,  // subtle nudge — barely perceptible
    mid:   1.08,  // comfortable mid-range
    far:   1.14,  // cross-page moves need more context
    max:   1.40,  // Clamped to 1.40 to restrict manual zoom scale limits
    event: 1.0,   // Fullscreen-first: no zoom during event phase; click ripple shows focus
  },
};
