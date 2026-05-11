export const SCHEMA_VERSION = "1.0";

export const STORAGE_QUOTA_FREE_BYTES = 1 * 1024 * 1024 * 1024;      // 1GB
export const STORAGE_QUOTA_STARTER_BYTES = 5 * 1024 * 1024 * 1024;   // 5GB
export const STORAGE_QUOTA_PRO_BYTES = 20 * 1024 * 1024 * 1024;      // 20GB

// Credits cost per generation
export const CREDITS_SOP = 1;
export const CREDITS_DEMO = 1;
export const CREDITS_VIDEO = 2;

// Capture engine
export const DOM_SETTLE_DELAY_MS = 150;       // wait for mutations to stop
export const MAX_SCREENSHOT_WIDTH = 1920;
export const KEEPALIVE_PING_INTERVAL_MS = 20000;

// Pipeline
export const PIPELINE_TIMEOUT_MS = 120000;    // 2 min max pipeline run
export const DEFAULT_ZOOM_SCALE = 2.5;
export const DEFAULT_TRANSITION_MS = 400;
export const DEFAULT_ZOOM_IN_MS = 600;
export const DEFAULT_ZOOM_OUT_MS = 300;
export const DEFAULT_DWELL_MS = 2500;         // fallback dwell if no voiceover

// R2 signed URL TTL
export const ASSET_URL_TTL_SECONDS = 3600;    // 1 hour

export const PLAYER_BASE_URL = "https://player.studiobase.app";
export const BACKEND_URL = "https://studiobase-backend.karthik-upadhyay98.workers.dev";
export const DEV_MODE = true; // Toggle for local studio testing
export const STUDIO_URL = DEV_MODE ? "http://localhost:5173" : "https://studiobase.app";
