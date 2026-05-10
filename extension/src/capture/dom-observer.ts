// ============================================================
// DOM OBSERVER — Content Script
// Listens for user interactions and ships raw event metadata
// to the background service worker via chrome.runtime.sendMessage.
// NEVER calls preventDefault. NEVER blocks the event.
// NEVER does AI processing or screenshot logic — that's the SW's job.
// ============================================================

import { generateSelector } from './selector-engine';
import { DOM_SETTLE_DELAY_MS } from '../../../shared/constants';

export type CaptureMessage =
  | { type: 'CAPTURE_STEP'; payload: RawStepPayload }
  | { type: 'SESSION_ACTIVE_CHECK' }
  | { type: 'FRAME_INFO'; payload: { isTopFrame: boolean; frameUrl: string } };

export interface RawStepPayload {
  action: 'click' | 'input' | 'scroll' | 'navigate';
  timestamp: number;
  url: string;
  pageTitle: string;
  selector: string | null;
  selectorConfidence: 'high' | 'medium' | 'low' | null;
  elementText: string | null;
  elementRole: string | null;
  elementType: string | null;
  inputValue: string | null;
  coordinates: {
    x: number;
    y: number;
    viewportWidth: number;
    viewportHeight: number;
    scrollX: number;
    scrollY: number;
    elementRect: { top: number; left: number; width: number; height: number } | null;
  };
  isIframeBlocked: boolean;
  frameUrl: string;
}

let isCapturing = false;
let cleanupFns: (() => void)[] = [];

// ─── Session State (content script side) ─────────────────────

export function startCapture() {
  if (isCapturing) return;
  isCapturing = true;
  attachListeners();
}

export function stopCapture() {
  isCapturing = false;
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];
}

// ─── Event Listeners ─────────────────────────────────────────

function attachListeners() {
  const onMousedown = (e: MouseEvent) => {
    if (!isCapturing) return;
    const target = e.target as Element;
    if (!target || target.tagName === 'HTML' || target.tagName === 'BODY') return;
    handleInteraction('click', target, e.clientX, e.clientY);
  };

  const onInput = (e: Event) => {
    if (!isCapturing) return;
    const target = e.target as HTMLInputElement;
    if (!target) return;
    // Debounce inputs — only capture after 800ms idle
    clearTimeout((onInput as any)._timer);
    (onInput as any)._timer = setTimeout(() => {
      handleInteraction('input', target, null, null, target.value);
    }, 800);
  };

  // Patch history API to detect SPA navigation
  const originalPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    originalPushState(...args);
    if (isCapturing) scheduleNavigationCapture();
  };

  const onPopState = () => {
    if (isCapturing) scheduleNavigationCapture();
  };

  document.addEventListener('mousedown', onMousedown, { capture: true, passive: true });
  document.addEventListener('input', onInput, { capture: true, passive: true });
  window.addEventListener('popstate', onPopState);

  cleanupFns.push(() => {
    document.removeEventListener('mousedown', onMousedown, { capture: true } as any);
    document.removeEventListener('input', onInput, { capture: true } as any);
    window.removeEventListener('popstate', onPopState);
    history.pushState = originalPushState;
  });
}

// ─── Interaction Handler ──────────────────────────────────────

function handleInteraction(
  action: RawStepPayload['action'],
  target: Element,
  clientX: number | null,
  clientY: number | null,
  inputValue?: string
) {
  // Collect all synchronous data immediately — before any DOM mutation
  const selectorResult = generateSelector(target);
  const rect = target.getBoundingClientRect();

  const payload: RawStepPayload = {
    action,
    timestamp: Date.now(),
    url: location.href,
    pageTitle: document.title,
    selector: selectorResult.selector,
    selectorConfidence: selectorResult.confidence,
    elementText: getElementText(target),
    elementRole: target.getAttribute('role') || target.tagName.toLowerCase(),
    elementType: target.tagName.toLowerCase(),
    inputValue: inputValue || null,
    coordinates: {
      x: clientX ?? rect.left + rect.width / 2,
      y: clientY ?? rect.top + rect.height / 2,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      elementRect: rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : null,
    },
    isIframeBlocked: window !== window.top,
    frameUrl: location.href,
  };

  // Signal background worker to take screenshot after DOM settles
  chrome.runtime.sendMessage({ type: 'CAPTURE_STEP', payload });
}

function scheduleNavigationCapture() {
  setTimeout(() => {
    const payload: RawStepPayload = {
      action: 'navigate',
      timestamp: Date.now(),
      url: location.href,
      pageTitle: document.title,
      selector: null,
      selectorConfidence: null,
      elementText: null,
      elementRole: null,
      elementType: null,
      inputValue: null,
      coordinates: {
        x: 0, y: 0,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scrollX: 0, scrollY: 0,
        elementRect: null,
      },
      isIframeBlocked: false,
      frameUrl: location.href,
    };
    chrome.runtime.sendMessage({ type: 'CAPTURE_STEP', payload });
  }, 300); // give SPA time to render the new route
}

// ─── Helpers ─────────────────────────────────────────────────

function getElementText(element: Element): string | null {
  const text = (element as HTMLElement).innerText || element.textContent || element.getAttribute('aria-label') || element.getAttribute('title') || null;
  return text ? text.trim().slice(0, 120) : null;
}

// ─── Entry Point ──────────────────────────────────────────────
// Content script listens for start/stop commands from the popup via background SW

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'START_CAPTURE') startCapture();
  if (message.type === 'STOP_CAPTURE') stopCapture();
});
