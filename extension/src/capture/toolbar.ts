// toolbar.ts
// This script handles the recording toolbar and cursor effects.

export type CursorMode = 'default' | 'black' | 'ripple' | 'spotlight' | 'laser';

let toolbarContainer: HTMLDivElement | null = null;
let spotlightOverlay: HTMLDivElement | null = null;
let timerInterval: any = null;
let startTime: number = 0;
let activeCursorMode: CursorMode = 'default';
let cursorEl: HTMLDivElement | null = null;
let mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
let mouseClickHandler: ((e: MouseEvent) => void) | null = null;

export function getActiveCursorMode() {
  return activeCursorMode;
}

export function injectToolbar() {
  if (document.getElementById('sb-toolbar-container')) return;

  toolbarContainer = document.createElement('div');
  toolbarContainer.id = 'sb-toolbar-container';
  
  // Style Container
  Object.assign(toolbarContainer.style, {
    position: 'fixed',
    bottom: '24px',
    left: '0',
    right: '0',
    display: 'flex',
    justifyContent: 'center',
    zIndex: '2147483647',
    pointerEvents: 'none',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
  });

  // Main Pill
  const pill = document.createElement('div');
  Object.assign(pill.style, {
    background: '#ffffff',
    borderRadius: '999px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    padding: '8px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    pointerEvents: 'auto',
    border: '1px solid #e0e0e0'
  });

  const modes = [
    { id: 'default', icon: '↖️', label: 'Default' },
    { id: 'black', icon: '↖️', label: 'Black Bold', color: 'black' },
    { id: 'ripple', icon: '◎', label: 'Click Ripple' },
    { id: 'spotlight', icon: '☀', label: 'Spotlight' },
    { id: 'laser', icon: '🔴', label: 'Laser Pointer' }
  ];

  pill.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <div style="width: 8px; height: 8px; background: #ff3b30; border-radius: 50%; animation: pulse 1s infinite;"></div>
      <span id="sb-timer" style="font-variant-numeric: tabular-nums; font-weight: 600; font-size: 14px; min-width: 45px;">00:00</span>
    </div>
    <div style="width: 1px; height: 20px; background: #e0e0e0;"></div>
    <div style="display: flex; gap: 8px;">
      <button id="sb-stop-btn" title="Stop & Finish" style="background: #1a1a1a; color: white; border: none; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
        <div style="width: 10px; height: 10px; background: white; border-radius: 2px;"></div>
      </button>
      <button id="sb-discard-btn" title="Discard" style="background: none; border: 1px solid #e0e0e0; color: #666; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
        ×
      </button>
    </div>
    <div style="width: 1px; height: 20px; background: #e0e0e0;"></div>
    <div style="display: flex; gap: 4px;">
      ${modes.map(m => `
        <button id="sb-mode-${m.id}" title="${m.label}" style="background: none; border: none; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 16px; transition: background 0.2s; ${m.color === 'black' ? 'filter: grayscale(1) brightness(0);' : ''}">
          ${m.icon}
        </button>
      `).join('')}
    </div>
  `;

  toolbarContainer.appendChild(pill);
  document.body.appendChild(toolbarContainer);

  // Timer Logic
  startTime = Date.now();
  const timerEl = document.getElementById('sb-timer');
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    if (timerEl) timerEl.textContent = `${m}:${s}`;
  }, 1000);

  // Button Listeners
  document.getElementById('sb-stop-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
  });

  document.getElementById('sb-discard-btn')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to discard this recording?')) {
      chrome.runtime.sendMessage({ type: 'ABORT_RECORDING' });
    }
  });

  modes.forEach(m => {
    document.getElementById(`sb-mode-${m.id}`)?.addEventListener('click', () => setCursorMode(m.id as any));
  });

  // Pulse animation style
  const style = document.createElement('style');
  style.id = 'sb-toolbar-styles';
  style.textContent = `
    @keyframes pulse {
      0% { opacity: 1; }
      50% { opacity: 0.4; }
      100% { opacity: 1; }
    }
    @keyframes sb-ripple {
      0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
    }
    @keyframes sb-laser-pulse {
      0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; border-width: 4px; }
      100% { transform: translate(-50%, -50%) scale(2); opacity: 0; border-width: 1px; }
    }
  `;
  document.head.appendChild(style);

  // Initial cursor mode
  applyCursorMode('default');
}

export function removeToolbar() {
  if (toolbarContainer) {
    toolbarContainer.remove();
    toolbarContainer = null;
  }
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  document.getElementById('sb-toolbar-styles')?.remove();
  cleanupCursor();
}

function setCursorMode(mode: CursorMode) {
  activeCursorMode = mode;
  applyCursorMode(mode);
}

function applyCursorMode(mode: CursorMode) {
  cleanupCursor();
  activeCursorMode = mode;
  document.body.style.cursor = 'none';

  // Update UI state
  const modes = ['default', 'black', 'ripple', 'spotlight', 'laser'];
  modes.forEach(m => {
    const btn = document.getElementById(`sb-mode-${m}`);
    if (btn) {
      btn.style.background = m === mode ? '#5e5ce6' : 'none';
      btn.style.color = m === mode ? 'white' : '';
      if (m === 'black' && m !== mode) btn.style.filter = 'grayscale(1) brightness(0)';
      else if (m === 'black' && m === mode) btn.style.filter = 'brightness(0) invert(1)';
      else btn.style.filter = '';
    }
  });

  // Create cursor DOM element
  cursorEl = document.createElement('div');
  cursorEl.id = 'sb-cursor';
  Object.assign(cursorEl.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '2147483645',
    transition: 'none',
    transform: 'translate(0, 0)', // will be updated by mousemove
    left: '0',
    top: '0'
  });

  const arrowSvg = (color: string) => `
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 2L25 20L15.5 21L11.5 30L7 2Z" fill="${color}" stroke="${color === 'white' ? 'black' : 'white'}" stroke-width="2" stroke-linejoin="round"/>
    </svg>
  `;

  if (mode === 'default' || mode === 'ripple' || mode === 'spotlight') {
    cursorEl.innerHTML = arrowSvg(mode === 'spotlight' || mode === 'default' ? 'white' : 'white');
    if (mode === 'ripple') cursorEl.innerHTML = arrowSvg('black');
  } else if (mode === 'black') {
    cursorEl.innerHTML = arrowSvg('black');
    cursorEl.style.width = '40px';
    cursorEl.style.height = '40px';
    cursorEl.querySelector('svg')?.setAttribute('width', '40');
    cursorEl.querySelector('svg')?.setAttribute('height', '40');
  } else if (mode === 'laser') {
    Object.assign(cursorEl.style, {
      width: '12px',
      height: '12px',
      background: 'red',
      borderRadius: '50%',
      boxShadow: '0 0 8px 4px rgba(255,0,0,0.6), 0 0 2px 1px red',
      transform: 'translate(-50%, -50%)'
    });
  }

  document.body.appendChild(cursorEl);

  mouseMoveHandler = (e: MouseEvent) => {
    if (cursorEl) {
      if (mode === 'laser') {
        cursorEl.style.left = e.clientX + 'px';
        cursorEl.style.top = e.clientY + 'px';
      } else {
        cursorEl.style.left = e.clientX + 'px';
        cursorEl.style.top = e.clientY + 'px';
      }
    }
    if (mode === 'spotlight') updateSpotlight(e);
  };

  if (mode === 'ripple' || mode === 'laser') {
    mouseClickHandler = (e: MouseEvent) => spawnRipple(e.clientX, e.clientY, mode);
    document.addEventListener('mousedown', mouseClickHandler, true);
  }

  document.addEventListener('mousemove', mouseMoveHandler, true);
  if (mode === 'spotlight') initSpotlight();
}

function cleanupCursor() {
  document.body.style.cursor = '';
  cursorEl?.remove();
  cursorEl = null;
  if (mouseMoveHandler) document.removeEventListener('mousemove', mouseMoveHandler, true);
  if (mouseClickHandler) document.removeEventListener('mousedown', mouseClickHandler, true);
  removeSpotlight();
}

function spawnRipple(x: number, y: number, mode: CursorMode) {
  const ripple = document.createElement('div');
  Object.assign(ripple.style, {
    position: 'fixed',
    left: x + 'px',
    top: y + 'px',
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    pointerEvents: 'none',
    zIndex: '2147483644',
    background: mode === 'laser' ? 'none' : 'rgba(94, 92, 230, 0.4)',
    border: mode === 'laser' ? '2px solid red' : 'none',
    animation: mode === 'laser' ? 'sb-laser-pulse 0.4s ease-out forwards' : 'sb-ripple 0.4s ease-out forwards'
  });
  document.body.appendChild(ripple);
  setTimeout(() => ripple.remove(), 400);
}

// Spotlight Logic
function initSpotlight() {
  if (spotlightOverlay) return;

  spotlightOverlay = document.createElement('div');
  spotlightOverlay.id = 'sb-spotlight-overlay';
  Object.assign(spotlightOverlay.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '2147483643',
    background: 'rgba(0,0,0,0.45)',
    transition: 'opacity 0.3s ease'
  });

  document.body.appendChild(spotlightOverlay);
}

function updateSpotlight(e: MouseEvent) {
  if (!spotlightOverlay) return;
  const x = e.clientX;
  const y = e.clientY;
  const mask = `radial-gradient(circle 90px at ${x}px ${y}px, transparent 88px, black 90px)`;
  spotlightOverlay.style.webkitMaskImage = mask;
  spotlightOverlay.style.maskImage = mask;
}

function removeSpotlight() {
  if (spotlightOverlay) {
    spotlightOverlay.remove();
    spotlightOverlay = null;
  }
}
