export const SCHEMA_VERSION = "1.0";

export const STORAGE_QUOTA_FREE_BYTES = 1 * 1024 * 1024 * 1024; // 1GB
export const STORAGE_QUOTA_STARTER_BYTES = 5 * 1024 * 1024 * 1024; // 5GB
export const STORAGE_QUOTA_PRO_BYTES = 20 * 1024 * 1024 * 1024; // 20GB

// Credits cost per generation
export const CREDITS_SOP = 1;
export const CREDITS_DEMO = 1;
export const CREDITS_VIDEO = 2;

// Capture engine
export const DOM_SETTLE_DELAY_MS = 150; // wait for mutations to stop
export const MAX_SCREENSHOT_WIDTH = 1920;
export const KEEPALIVE_PING_INTERVAL_MS = 20000;

// Pipeline
export const PIPELINE_TIMEOUT_MS = 120000; // 2 min max pipeline run
export const DEFAULT_ZOOM_SCALE = 2.5;
export const DEFAULT_TRANSITION_MS = 400;
export const DEFAULT_ZOOM_IN_MS = 600;
export const DEFAULT_ZOOM_OUT_MS = 300;
export const DEFAULT_DWELL_MS = 2500; // fallback dwell if no voiceover

// R2 signed URL TTL
export const ASSET_URL_TTL_SECONDS = 3600; // 1 hour

export const PLAYER_BASE_URL = "https://player.studiobase.app";

// DEV_MODE is set at build time via the VITE_DEV_MODE environment variable.
// Set VITE_DEV_MODE=true in a local .env file to point at localhost.
// Never set this in production — Cloudflare Pages env vars do not include VITE_DEV_MODE.
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true';

// BACKEND_URL: prefers an explicit override (VITE_BACKEND_URL) for CI/staging,
// then falls back to localhost or the production worker based on DEV_MODE.
export const BACKEND_URL: string =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ??
  (DEV_MODE
    ? 'http://localhost:8787/v1'
    : 'https://studiobase-backend.karthik-upadhyay98.workers.dev/v1');

export const V1_API_URL = BACKEND_URL;

// Studio URL depends on whether we are in local dev or production
export const STUDIO_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? `http://${window.location.host}`
  : "https://studio.studiobase.app";
