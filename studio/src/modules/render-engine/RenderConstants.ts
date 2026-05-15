export const RenderConstants = {
  PANEL_WIDTH: 480,
  SOP_MAX_WIDTH: 860,
  GLOW_RADIUS: 500,
  ASSET_REFRESH_INTERVAL: 15 * 60 * 1000,
  PLAYER_MAX_HEIGHT: 'calc(100vh - 280px)',
  PLAYER_ASPECT_RATIO: '16/9',
  EXPORT_COMPOSITOR_WIDTH: 2880,
  EXPORT_COMPOSITOR_HEIGHT: 1444,
  EXPORT_VISUAL_WIDTH: '288px',
  EXPORT_VISUAL_HEIGHT: '162px',
  EXPORT_VIDEO_BITRATE: 25000000,
  EXPORT_FPS: 60,
  GRID_SPACING: 60,
  PANEL_SPRING: { type: 'spring' as const, stiffness: 280, damping: 36 },
  CAMERA_SPRING: { type: 'spring' as const, stiffness: 70, damping: 18, mass: 1.1, restDelta: 0.001 }
};
