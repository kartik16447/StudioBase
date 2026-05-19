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

  // Cinematic camera springs — critically damped, heavy, no oscillation
  // XY (pan): stiffness 40, damping 24, mass 1.6 → slow lazy pan, settles ~1.4s
  // Scale (zoom): stiffness 32, damping 26, mass 1.8 → even heavier zoom, settles ~1.8s
  CAMERA_XY_SPRING:    { stiffness: 40, damping: 24, mass: 1.6, restDelta: 0.001 },
  CAMERA_SCALE_SPRING: { stiffness: 32, damping: 26, mass: 1.8, restDelta: 0.001 },
};
