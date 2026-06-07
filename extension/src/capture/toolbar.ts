// toolbar.ts — StudioBase recording toolbar (dark-glass pill design)
// States: recording → processing → done
// Positions: top | bottom | left | right  (drag handle snaps to nearest edge)
// Toolbar tray: collapsed (default) | expanded

export type CursorMode = 'default' | 'black' | 'ripple' | 'spotlight' | 'laser';
type ToolbarState    = 'recording' | 'paused' | 'processing' | 'done';
type ToolbarPosition = 'top' | 'bottom' | 'left' | 'right';

// ─── Module-level state ────────────────────────────────────────────────────────
let toolbarContainer: HTMLDivElement | null = null;
let spotlightOverlay: HTMLDivElement | null = null;
let timerInterval: ReturnType<typeof setInterval> | null = null;
let startTime    = 0;
let pausedElapsed = 0;
let activeCursorMode: CursorMode   = 'default';
let cursorEl: HTMLDivElement | null = null;
let mouseMoveHandler:  ((e: MouseEvent) => void) | null = null;
let mouseClickHandler: ((e: MouseEvent) => void) | null = null;
let toolbarState: ToolbarState   = 'recording';
let isToolbarExpanded             = false;
let toolbarPosition: ToolbarPosition = 'top';

// drag state
let dragActive    = false;
let dragStartX    = 0, dragStartY    = 0;
let dragOriginLeft = 0, dragOriginTop = 0;
let dragMoveHandler: ((e: MouseEvent) => void) | null = null;
let dragUpHandler:   ((e: MouseEvent) => void) | null = null;

// ─── Design tokens ────────────────────────────────────────────────────────────
const TB = {
  glass:        'rgba(17,17,17,0.82)',
  border:       'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  primary:      '#5E5CE6',
  danger:       '#FF453A',
  ok:           '#30D158',
  text:         '#ffffff',
  textDim:      'rgba(255,255,255,0.80)',
  textMute:     'rgba(255,255,255,0.55)',
  shadow:       '0 8px 32px rgba(0,0,0,0.40)',
  font:   '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, "Segoe UI", system-ui, sans-serif',
  mono:   'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

// ─── Public API ────────────────────────────────────────────────────────────────
export function getActiveCursorMode(): CursorMode { return activeCursorMode; }

export function injectToolbar(): void {
  if (document.getElementById('sb-toolbar-container')) return;

  injectStyles();

  isToolbarExpanded = false;
  toolbarPosition   = 'top';

  toolbarContainer = document.createElement('div');
  toolbarContainer.id = 'sb-toolbar-container';
  applyContainerPosition();
  Object.assign(toolbarContainer.style, {
    position:      'fixed',
    display:       'flex',
    zIndex:        '2147483647',
    pointerEvents: 'none',
    fontFamily:    TB.font,
  });

  document.body.appendChild(toolbarContainer);

  startTime     = Date.now();
  pausedElapsed = 0;
  toolbarState  = 'recording';
  renderPill();

  timerInterval = setInterval(updateTimer, 1000);
  applyCursorMode('default');
}

export function removeToolbar(): void {
  toolbarContainer?.remove();
  toolbarContainer = null;
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  document.getElementById('sb-toolbar-styles')?.remove();
  cleanupCursor();
  // clean up any lingering drag listeners
  if (dragMoveHandler) { document.removeEventListener('mousemove', dragMoveHandler, true); dragMoveHandler = null; }
  if (dragUpHandler)   { document.removeEventListener('mouseup',   dragUpHandler,   true); dragUpHandler   = null; }
}

export function showProcessingState(): void {
  toolbarState = 'processing';
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  renderPill();
}

export function showDoneState(): void {
  toolbarState = 'done';
  renderPill();
}

// ─── Container positioning ─────────────────────────────────────────────────────
function applyContainerPosition(): void {
  if (!toolbarContainer) return;
  const isV = toolbarPosition === 'left' || toolbarPosition === 'right';

  // Reset
  Object.assign(toolbarContainer.style, {
    top: '', bottom: '', left: '', right: '',
    transform: '', width: '', height: '',
    justifyContent: 'center', alignItems: 'center',
    flexDirection:  isV ? 'column' : 'row',
  });

  switch (toolbarPosition) {
    case 'top':
      Object.assign(toolbarContainer.style, { top: '24px', left: '0', right: '0' });
      break;
    case 'bottom':
      Object.assign(toolbarContainer.style, { bottom: '24px', left: '0', right: '0' });
      break;
    case 'left':
      Object.assign(toolbarContainer.style, {
        left: '16px', top: '0', bottom: '0',
        width: '56px',
      });
      break;
    case 'right':
      Object.assign(toolbarContainer.style, {
        right: '16px', top: '0', bottom: '0',
        width: '56px',
      });
      break;
  }
}

// ─── Drag logic ────────────────────────────────────────────────────────────────
function startDrag(e: MouseEvent): void {
  if (!toolbarContainer) return;
  e.preventDefault();
  e.stopPropagation();

  dragActive = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;

  // For top/bottom positions the container spans full viewport width and is
  // centered via flexbox — rect.left would be 0 and the pill would snap to the
  // left edge on mousedown. Use the pill's own bounding rect instead so the
  // free-drag origin matches where the pill actually sits on screen.
  const pill     = toolbarContainer.firstElementChild as HTMLElement | null;
  const pillRect = pill ? pill.getBoundingClientRect() : toolbarContainer.getBoundingClientRect();
  dragOriginLeft = pillRect.left;
  dragOriginTop  = pillRect.top;

  // Free-position mode during drag
  Object.assign(toolbarContainer.style, {
    left: pillRect.left + 'px', right: 'auto',
    top:  pillRect.top  + 'px', bottom: 'auto',
    width: '', height: '',
    justifyContent: 'flex-start',
    transform: 'none',
  });
  document.body.style.userSelect = 'none';

  dragMoveHandler = (me: MouseEvent) => {
    if (!toolbarContainer) return;
    const dx = me.clientX - dragStartX;
    const dy = me.clientY - dragStartY;
    toolbarContainer.style.left = (dragOriginLeft + dx) + 'px';
    toolbarContainer.style.top  = (dragOriginTop  + dy) + 'px';
  };

  dragUpHandler = (me: MouseEvent) => {
    dragActive = false;
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', dragMoveHandler!, true);
    document.removeEventListener('mouseup',   dragUpHandler!,   true);
    dragMoveHandler = null;
    dragUpHandler   = null;

    if (!toolbarContainer) return;

    // Ignore accidental clicks on the drag handle — require at least 8px of movement
    const movedX = Math.abs(me.clientX - dragStartX);
    const movedY = Math.abs(me.clientY - dragStartY);
    if (movedX < 8 && movedY < 8) {
      // Restore original position — no snap
      applyContainerPosition();
      renderPill();
      return;
    }

    // Snap to nearest edge using cursor release position (not pill center).
    // This is more intuitive: drop near top → snaps top, regardless of pill width.
    const cx = me.clientX;
    const cy = me.clientY;
    const W  = window.innerWidth;
    const H  = window.innerHeight;

    const dTop    = cy;
    const dBottom = H - cy;
    const dLeft   = cx;
    const dRight  = W - cx;
    const min     = Math.min(dTop, dBottom, dLeft, dRight);

    if      (min === dTop)    toolbarPosition = 'top';
    else if (min === dBottom) toolbarPosition = 'bottom';
    else if (min === dLeft)   toolbarPosition = 'left';
    else                      toolbarPosition = 'right';

    applyContainerPosition();
    renderPill();
  };

  document.addEventListener('mousemove', dragMoveHandler, true);
  document.addEventListener('mouseup',   dragUpHandler,   true);
}

// ─── Render ────────────────────────────────────────────────────────────────────
function renderPill(): void {
  if (!toolbarContainer) return;
  toolbarContainer.innerHTML = '';

  const pill = createPillShell();
  toolbarContainer.appendChild(pill);

  switch (toolbarState) {
    case 'recording':
    case 'paused':
      isToolbarExpanded ? buildExpandedPill(pill) : buildCollapsedPill(pill);
      break;
    case 'processing': buildProcessingPill(pill); break;
    case 'done':       buildDonePill(pill);        break;
  }
}

function createPillShell(): HTMLDivElement {
  const isV = toolbarPosition === 'left' || toolbarPosition === 'right';
  const pill = document.createElement('div');
  Object.assign(pill.style, {
    position:      'relative',
    display:       'inline-flex',
    alignItems:    'center',
    justifyContent: 'center',
    flexDirection: isV ? 'column' : 'row',
    gap:           isV ? '2px' : '6px',
    height:        isV ? 'auto' : '48px',
    width:         isV ? '48px' : 'auto',
    padding:       isV ? '8px 0' : '0 8px',
    background:    TB.glass,
    backdropFilter: 'blur(20px) saturate(140%)',
    WebkitBackdropFilter: 'blur(20px) saturate(140%)',
    border:        `1px solid ${TB.border}`,
    borderRadius:  '999px',
    boxShadow:     TB.shadow,
    fontFamily:    TB.font,
    color:         TB.text,
    pointerEvents: 'auto',
  });
  return pill;
}

// ─── Collapsed pill ────────────────────────────────────────────────────────────
function buildCollapsedPill(pill: HTMLDivElement): void {
  const isRec = toolbarState === 'recording';
  const isV   = toolbarPosition === 'left' || toolbarPosition === 'right';

  // Glow (recording only)
  if (isRec) {
    const glow = document.createElement('span');
    glow.className = 'sb-rec-glow';
    Object.assign(glow.style, {
      position: 'absolute', inset: '-1px', borderRadius: '999px',
      pointerEvents: 'none',
      boxShadow: '0 0 0 1px rgba(255,69,58,0.30), 0 0 22px 2px rgba(255,69,58,0.30)',
      animation: 'sb-border-pulse 2s ease-in-out infinite',
    });
    pill.appendChild(glow);
  }

  pill.appendChild(makeDragHandle());

  if (!isV) {
    // Rec dot or paused label inline
    pill.appendChild(isRec ? makeRecDot() : makePausedDot());
    // Timer
    const timerEl = document.createElement('span');
    timerEl.id = 'sb-timer';
    timerEl.textContent = fmtTimer(pausedElapsed + (isRec ? Math.floor((Date.now() - startTime) / 1000) : 0));
    Object.assign(timerEl.style, {
      fontFamily: TB.mono, fontSize: '12px', fontWeight: '600',
      fontVariantNumeric: 'tabular-nums', color: TB.text, letterSpacing: '0.4px',
      marginRight: '2px',
    });
    pill.appendChild(timerEl);
    pill.appendChild(makeSpacer(2));
    pill.appendChild(makeDivider());
    pill.appendChild(makeSpacer(2));
  }

  // Pause / Resume
  if (isRec) {
    pill.appendChild(makeIconBtn('pause', 'Pause', () => {
      pausedElapsed += Math.floor((Date.now() - startTime) / 1000);
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      toolbarState = 'paused';
      renderPill();
    }));
  } else {
    pill.appendChild(makeIconBtn('play', 'Resume', () => {
      startTime     = Date.now();
      toolbarState  = 'recording';
      timerInterval = setInterval(updateTimer, 1000);
      renderPill();
    }));
  }

  // Stop (icon only, red)
  const stopBtn = makeIconBtn('stop', 'Stop & Process', () => {
    showProcessingState();
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
  });
  stopBtn.innerHTML = makeSvgIcon('stop', TB.danger);
  pill.appendChild(stopBtn);

  if (!isV) pill.appendChild(makeDivider());

  // Active cursor button — click to expand tray
  pill.appendChild(makeActiveCursorBtn());

  // Expand chevron
  pill.appendChild(makeExpandCollapseBtn(false));
}

// ─── Expanded pill ─────────────────────────────────────────────────────────────
function buildExpandedPill(pill: HTMLDivElement): void {
  const isRec = toolbarState === 'recording';
  const isV   = toolbarPosition === 'left' || toolbarPosition === 'right';

  if (isRec) {
    const glow = document.createElement('span');
    glow.className = 'sb-rec-glow';
    Object.assign(glow.style, {
      position: 'absolute', inset: '-1px', borderRadius: '999px',
      pointerEvents: 'none',
      boxShadow: '0 0 0 1px rgba(255,69,58,0.30), 0 0 22px 2px rgba(255,69,58,0.30)',
      animation: 'sb-border-pulse 2s ease-in-out infinite',
    });
    pill.appendChild(glow);
  }

  pill.appendChild(makeDragHandle());

  // Timer section (recording only)
  if (!isV) {
    const timerSection = document.createElement('span');
    Object.assign(timerSection.style, {
      display: 'inline-flex', alignItems: 'center', gap: '8px',
      paddingLeft: '4px', paddingRight: '2px',
      opacity: isRec ? '1' : '0.55',
    });
    if (isRec) timerSection.appendChild(makeRecDot());
    const timerEl = document.createElement('span');
    timerEl.id = 'sb-timer';
    timerEl.textContent = fmtTimer(pausedElapsed + (isRec ? Math.floor((Date.now() - startTime) / 1000) : 0));
    Object.assign(timerEl.style, {
      fontFamily: TB.mono, fontSize: '13px', fontWeight: '600',
      fontVariantNumeric: 'tabular-nums', color: TB.text, letterSpacing: '0.4px',
    });
    if (!isRec) {
      const pauseLabel = document.createElement('span');
      Object.assign(pauseLabel.style, { fontSize: '12px', color: TB.textMute });
      pauseLabel.textContent = 'PAUSED';
      timerSection.appendChild(timerEl);
      timerSection.appendChild(pauseLabel);
    } else {
      timerSection.appendChild(timerEl);
    }
    pill.appendChild(timerSection);
    pill.appendChild(makeSpacer(8));
    pill.appendChild(makeDivider());
    pill.appendChild(makeSpacer(4));
  }

  // Pause / Resume
  if (isRec) {
    pill.appendChild(makeIconBtn('pause', 'Pause', () => {
      pausedElapsed += Math.floor((Date.now() - startTime) / 1000);
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      toolbarState = 'paused';
      renderPill();
    }));
  } else {
    pill.appendChild(makeIconBtn('play', 'Resume', () => {
      startTime     = Date.now();
      toolbarState  = 'recording';
      timerInterval = setInterval(updateTimer, 1000);
      renderPill();
    }));
  }

  // Annotate
  pill.appendChild(makeIconBtn('pencil', 'Add annotation', () => {
    chrome.runtime.sendMessage({ type: 'ANNOTATION' });
  }));

  if (!isV) { pill.appendChild(makeSpacer(4)); pill.appendChild(makeDivider()); pill.appendChild(makeSpacer(4)); }
  else       { pill.appendChild(makeDividerH()); }

  // Cursor mode buttons — after selecting, collapse tray
  const modes: CursorMode[] = ['default', 'black', 'ripple', 'spotlight', 'laser'];
  modes.forEach(m => pill.appendChild(makeCursorModeBtn(m, cursorModeLabel(m), true)));

  if (!isV) { pill.appendChild(makeSpacer(4)); pill.appendChild(makeDivider()); pill.appendChild(makeSpacer(4)); }
  else       { pill.appendChild(makeDividerH()); }

  // Stop & Process — icon-only in vertical mode to avoid overflowing the 48px pill
  if (isV) {
    const stopBtn = makeIconBtn('stop', 'Stop & Process', () => {
      showProcessingState();
      chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
    });
    stopBtn.innerHTML = makeSvgIcon('stop', TB.danger);
    pill.appendChild(stopBtn);
  } else {
    pill.appendChild(makePillBtn('stop', 'Stop & Process', 'danger', () => {
      showProcessingState();
      chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
    }));
  }

  // Collapse button
  pill.appendChild(makeExpandCollapseBtn(true));
}

// ─── Processing / Done states ──────────────────────────────────────────────────
function buildProcessingPill(pill: HTMLDivElement): void {
  pill.appendChild(makeDragHandle());

  const timerSection = document.createElement('span');
  Object.assign(timerSection.style, {
    display: 'inline-flex', alignItems: 'center', gap: '8px',
    paddingLeft: '4px', paddingRight: '2px', opacity: '0.4',
  });
  const timerEl = document.createElement('span');
  timerEl.textContent = fmtTimer(pausedElapsed);
  Object.assign(timerEl.style, {
    fontFamily: TB.mono, fontSize: '13px', fontWeight: '600',
    fontVariantNumeric: 'tabular-nums', color: TB.text, letterSpacing: '0.4px',
  });
  timerSection.appendChild(makeRecDot());
  timerSection.appendChild(timerEl);
  pill.appendChild(timerSection);
  pill.appendChild(makeSpacer(8));
  pill.appendChild(makeDivider());
  pill.appendChild(makeSpacer(4));

  const pauseBtn = makeIconBtn('pause', 'Pause', () => {});
  pauseBtn.style.opacity = '0.3'; pauseBtn.style.pointerEvents = 'none';
  pill.appendChild(pauseBtn);
  const annotateBtn = makeIconBtn('pencil', 'Annotate', () => {});
  annotateBtn.style.opacity = '0.3'; annotateBtn.style.pointerEvents = 'none';
  pill.appendChild(annotateBtn);

  pill.appendChild(makeSpacer(4));
  pill.appendChild(makePillBtn('spinner', 'Processing…', 'processing', () => {}));
}

function buildDonePill(pill: HTMLDivElement): void {
  pill.appendChild(makeDragHandle());

  const checkWrap = document.createElement('span');
  Object.assign(checkWrap.style, {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: '30px', height: '30px', borderRadius: '999px',
    background: 'rgba(48,209,88,0.16)', marginLeft: '2px',
  });
  checkWrap.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${TB.ok}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>`;
  pill.appendChild(checkWrap);

  const openBtn = document.createElement('button');
  openBtn.textContent = 'Ready in Studio';
  const extSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${TB.textDim}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/></svg>`;
  Object.assign(openBtn.style, {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    background: 'transparent', border: 'none', padding: '6px 8px',
    color: TB.text, fontFamily: TB.font, fontSize: '13.5px', fontWeight: '560',
    cursor: 'pointer', letterSpacing: '0.05px',
  });
  openBtn.insertAdjacentHTML('beforeend', extSvg);
  openBtn.addEventListener('mouseenter', () => { openBtn.style.textDecoration = 'underline'; });
  openBtn.addEventListener('mouseleave', () => { openBtn.style.textDecoration = 'none'; });
  openBtn.addEventListener('click', () => { chrome.runtime.sendMessage({ type: 'OPEN_STUDIO' }); });
  pill.appendChild(openBtn);
}

// ─── Atoms ─────────────────────────────────────────────────────────────────────
function makeDragHandle(): HTMLButtonElement {
  const isV   = toolbarPosition === 'left' || toolbarPosition === 'right';
  const btn   = document.createElement('button');
  btn.className = 'sb-drag';
  btn.title    = 'Drag to reposition';
  Object.assign(btn.style, {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width:  isV ? '32px' : '14px',
    height: isV ? '14px' : '32px',
    padding: '0',
    marginLeft: isV ? '0' : '-2px', marginRight: isV ? '0' : '2px',
    marginTop: isV ? '-2px' : '0', marginBottom: isV ? '2px' : '0',
    background: 'transparent', border: 'none', color: TB.textMute, borderRadius: '6px',
  });
  // Horizontal dots for vertical toolbar, vertical dots otherwise
  if (isV) {
    btn.innerHTML = `<svg width="18" height="8" viewBox="0 0 18 8" fill="currentColor">
      ${[0,6,12].flatMap(x => [0,5].map(y => `<circle cx="${x+2.5}" cy="${y+1.5}" r="1.25"/>`)).join('')}
    </svg>`;
  } else {
    btn.innerHTML = `<svg width="8" height="18" viewBox="0 0 8 18" fill="currentColor">
      ${[0,6,12].flatMap(y => [0,5].map(x => `<circle cx="${x+1.5}" cy="${y+2.5}" r="1.25"/>`)).join('')}
    </svg>`;
  }
  btn.addEventListener('mousedown', startDrag);
  return btn;
}

function makeRecDot(): HTMLSpanElement {
  const wrap = document.createElement('span');
  Object.assign(wrap.style, {
    position: 'relative', display: 'inline-flex', width: '12px', height: '12px',
    alignItems: 'center', justifyContent: 'center', flexShrink: '0',
  });
  const pulse = document.createElement('span');
  Object.assign(pulse.style, {
    position: 'absolute', width: '12px', height: '12px', borderRadius: '999px',
    background: TB.danger, opacity: '0.45',
    animation: 'sb-rec-pulse 1.6s ease-out infinite',
  });
  const dot = document.createElement('span');
  Object.assign(dot.style, {
    width: '8px', height: '8px', borderRadius: '999px', background: TB.danger,
    boxShadow: '0 0 6px rgba(255,69,58,0.9)',
  });
  wrap.appendChild(pulse);
  wrap.appendChild(dot);
  return wrap;
}

function makePausedDot(): HTMLSpanElement {
  const dot = document.createElement('span');
  Object.assign(dot.style, {
    display: 'inline-block', width: '8px', height: '8px',
    borderRadius: '999px', background: TB.textMute, flexShrink: '0',
  });
  return dot;
}

function makeDivider(): HTMLSpanElement {
  const el = document.createElement('span');
  Object.assign(el.style, {
    display: 'inline-block', width: '1px', height: '20px',
    background: TB.borderStrong, flex: '0 0 auto',
  });
  return el;
}

function makeDividerH(): HTMLSpanElement {
  const el = document.createElement('span');
  Object.assign(el.style, {
    display: 'block', height: '1px', width: '28px',
    background: TB.borderStrong, flex: '0 0 auto', margin: '2px auto',
  });
  return el;
}

function makeSpacer(w: number): HTMLSpanElement {
  const el = document.createElement('span');
  el.style.width = `${w}px`;
  return el;
}

// Active cursor button: shows selected cursor, click → expand tray
function makeActiveCursorBtn(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.title = 'Change cursor mode';
  btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block">${CURSOR_ICONS[activeCursorMode]}</svg>`;
  Object.assign(btn.style, {
    width: '30px', height: '30px', borderRadius: '6px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(94,92,230,0.22)',
    border: '1px solid rgba(94,92,230,0.50)',
    padding: '0', cursor: 'pointer', color: TB.textDim,
    transition: 'background 120ms',
  });
  btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(94,92,230,0.35)'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(94,92,230,0.22)'; });
  btn.addEventListener('click', () => { isToolbarExpanded = true; renderPill(); });
  return btn;
}

// Collapse / expand chevron
function makeExpandCollapseBtn(expanded: boolean): HTMLButtonElement {
  const btn  = document.createElement('button');
  btn.title  = expanded ? 'Collapse toolbar' : 'Expand toolbar';
  const isV  = toolbarPosition === 'left' || toolbarPosition === 'right';
  // For vertical toolbar, use left/right chevron; for horizontal, use up/down
  const chevronClose = isV
    ? (toolbarPosition === 'left'  ? '<path d="M15 6l-6 6 6 6"/>' : '<path d="M9 6l6 6-6 6"/>')
    : '<path d="M5 15l7-7 7 7"/>';
  const chevronOpen  = isV
    ? (toolbarPosition === 'left'  ? '<path d="M9 6l6 6-6 6"/>'  : '<path d="M15 6l-6 6 6 6"/>')
    : '<path d="M19 9l-7 7-7-7"/>';

  btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${TB.textMute}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="display:block">${expanded ? chevronClose : chevronOpen}</svg>`;
  Object.assign(btn.style, {
    width: '22px', height: '22px', borderRadius: '4px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', padding: '0', cursor: 'pointer',
    transition: 'background 120ms', flexShrink: '0',
  });
  btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.06)'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
  btn.addEventListener('click', () => { isToolbarExpanded = !expanded; renderPill(); });
  return btn;
}

const CURSOR_ICONS: Record<string, string> = {
  default:   `<path d="M7 2L25 20L15.5 21L11.5 30L7 2Z" fill="white" stroke="rgba(0,0,0,0.5)" stroke-width="2" stroke-linejoin="round"/>`,
  black:     `<path d="M7 2L25 20L15.5 21L11.5 30L7 2Z" fill="rgba(0,0,0,0.9)" stroke="white" stroke-width="2" stroke-linejoin="round"/>`,
  ripple:    `<circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="13" stroke="currentColor" stroke-width="1" fill="none" opacity="0.4"/>`,
  spotlight: `<circle cx="12" cy="12" r="5" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5.22 5.22l2.12 2.12M16.66 16.66l2.12 2.12M16.66 7.34l2.12-2.12M5.22 18.78l2.12-2.12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  laser:     `<circle cx="12" cy="12" r="3" fill="#FF453A"/><circle cx="12" cy="12" r="7" stroke="#FF453A" stroke-width="1.2" fill="none" opacity="0.6"/><circle cx="12" cy="12" r="11" stroke="#FF453A" stroke-width="0.8" fill="none" opacity="0.25"/>`,
};

function cursorModeLabel(m: CursorMode): string {
  return { default: 'Default cursor', black: 'Black cursor', ripple: 'Click ripple', spotlight: 'Spotlight', laser: 'Laser pointer' }[m];
}

// collapseAfterSelect: true when called from expanded tray
function makeCursorModeBtn(mode: CursorMode, label: string, collapseAfterSelect = false): HTMLButtonElement {
  const btn      = document.createElement('button');
  btn.id         = `sb-cursor-${mode}`;
  btn.title      = label;
  const isActive = activeCursorMode === mode;
  btn.innerHTML  = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block">${CURSOR_ICONS[mode]}</svg>`;
  Object.assign(btn.style, {
    width: '30px', height: '30px', borderRadius: '6px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: isActive ? 'rgba(94,92,230,0.30)' : 'transparent',
    border: isActive ? '1px solid rgba(94,92,230,0.55)' : '1px solid transparent',
    padding: '0', cursor: 'pointer', color: TB.textDim,
    transition: 'background 120ms, border-color 120ms',
  });
  btn.addEventListener('mouseenter', () => { if (activeCursorMode !== mode) btn.style.background = 'rgba(255,255,255,0.08)'; });
  btn.addEventListener('mouseleave', () => { if (activeCursorMode !== mode) btn.style.background = 'transparent'; });
  btn.addEventListener('click', () => {
    setCursorMode(mode);
    // Update active state on all sibling cursor buttons
    const modes: CursorMode[] = ['default', 'black', 'ripple', 'spotlight', 'laser'];
    modes.forEach(m => {
      const b = document.getElementById(`sb-cursor-${m}`) as HTMLButtonElement | null;
      if (!b) return;
      const active = m === mode;
      b.style.background = active ? 'rgba(94,92,230,0.30)' : 'transparent';
      b.style.border     = active ? '1px solid rgba(94,92,230,0.55)' : '1px solid transparent';
    });
    // Collapse tray after selection
    if (collapseAfterSelect) {
      isToolbarExpanded = false;
      renderPill();
    }
  });
  return btn;
}

const ICONS: Record<string, string> = {
  pause:   '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  play:    '<path d="M7 5l12 7-12 7z"/>',
  pencil:  '<path d="M12.5 6.5l5 5"/><path d="M4 20l4-1 11.3-11.3a2 2 0 0 0 0-2.83l-.17-.17a2 2 0 0 0-2.83 0L5 16l-1 4z"/>',
  stop:    '<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" stroke="currentColor"/>',
  spinner: '<path d="M12 3a9 9 0 1 0 9 9" opacity="0.95"/>',
};

function makeSvgIcon(name: string, color: string, size = 16): string {
  const inner = ICONS[name] ?? '';
  const spin  = name === 'spinner' ? 'animation: sb-spin 0.9s linear infinite;' : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="display:block;flex:0 0 auto;${spin}">${inner}</svg>`;
}

function makeIconBtn(icon: string, label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.title = label;
  btn.innerHTML = makeSvgIcon(icon, TB.textDim);
  Object.assign(btn.style, {
    width: '36px', height: '36px', borderRadius: '999px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', padding: '0',
    cursor: 'pointer', color: TB.textDim,
    transition: 'background 120ms, color 120ms',
  });
  btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.08)'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
  btn.addEventListener('click', onClick);
  return btn;
}

function makePillBtn(
  icon: string, label: string,
  variant: 'primary' | 'danger' | 'processing',
  onClick: () => void,
): HTMLButtonElement {
  const btn         = document.createElement('button');
  const isProcessing = variant === 'processing';
  const colors = {
    primary:    { bg: TB.primary, fg: '#fff', hoverBg: '#7472ec', shadow: '0 1px 0 rgba(255,255,255,0.18) inset,0 2px 8px rgba(94,92,230,0.35)' },
    danger:     { bg: TB.danger,  fg: '#fff', hoverBg: '#ff5e54', shadow: '0 1px 0 rgba(255,255,255,0.18) inset,0 2px 8px rgba(255,69,58,0.32)' },
    processing: { bg: 'rgba(94,92,230,0.18)', fg: TB.textDim, hoverBg: 'rgba(94,92,230,0.18)', shadow: 'none' },
  }[variant];

  btn.innerHTML = makeSvgIcon(icon, isProcessing ? TB.textDim : colors.fg, 16)
    + `<span style="position:relative;z-index:1">${label}</span>`;
  Object.assign(btn.style, {
    position: 'relative', overflow: 'hidden',
    display: 'inline-flex', alignItems: 'center', gap: '7px',
    height: '36px', padding: '0 14px 0 12px',
    borderRadius: '999px', border: 'none',
    cursor: isProcessing ? 'default' : 'pointer',
    background: colors.bg, color: isProcessing ? TB.textDim : colors.fg,
    fontFamily: TB.font, fontSize: '13.5px', fontWeight: '590', letterSpacing: '0.05px',
    boxShadow: colors.shadow,
    transition: 'background 140ms, transform 90ms',
  });

  if (isProcessing) {
    const shimmer = document.createElement('span');
    Object.assign(shimmer.style, {
      position: 'absolute', inset: '0',
      background: 'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)',
      backgroundSize: '200% 100%',
      animation: 'sb-shimmer 1.4s linear infinite',
      pointerEvents: 'none',
    });
    btn.insertBefore(shimmer, btn.firstChild);
  } else {
    btn.addEventListener('mouseenter', () => { btn.style.background = colors.hoverBg; });
    btn.addEventListener('mouseleave', () => { btn.style.background = colors.bg; });
    btn.addEventListener('mousedown',  () => { btn.style.transform  = 'scale(0.97)'; });
    btn.addEventListener('mouseup',    () => { btn.style.transform  = 'scale(1)'; });
    btn.addEventListener('click', onClick);
  }
  return btn;
}

// ─── Timer ─────────────────────────────────────────────────────────────────────
function updateTimer(): void {
  const el = document.getElementById('sb-timer');
  if (!el) return;
  const elapsed = pausedElapsed + Math.floor((Date.now() - startTime) / 1000);
  el.textContent = fmtTimer(elapsed);
}

function fmtTimer(totalSec: number): string {
  const h  = Math.floor(totalSec / 3600);
  const m  = Math.floor((totalSec % 3600) / 60);
  const s  = totalSec % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// ─── Styles ────────────────────────────────────────────────────────────────────
function injectStyles(): void {
  if (document.getElementById('sb-toolbar-styles')) return;
  const style = document.createElement('style');
  style.id = 'sb-toolbar-styles';
  style.textContent = `
    /* Hide native cursor on everything while recording */
    *, *::before, *::after { cursor: none !important; }
    /* Restore cursor on toolbar elements */
    #sb-toolbar-container *         { cursor: auto !important; }
    #sb-toolbar-container button    { cursor: pointer !important; }
    #sb-toolbar-container .sb-drag  { cursor: grab !important; }
    #sb-toolbar-container .sb-drag:active { cursor: grabbing !important; }

    @keyframes sb-spin {
      to { transform: rotate(360deg); }
    }
    @keyframes sb-shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    @keyframes sb-rec-pulse {
      0%   { transform: scale(1);   opacity: 0.55; }
      70%  { transform: scale(2.2); opacity: 0; }
      100% { transform: scale(2.2); opacity: 0; }
    }
    @keyframes sb-border-pulse {
      0%, 100% { box-shadow: 0 0 0 1px rgba(255,69,58,0.20), 0 0 12px 1px rgba(255,69,58,0.18); }
      50%      { box-shadow: 0 0 0 1px rgba(255,69,58,0.45), 0 0 28px 3px rgba(255,69,58,0.40); }
    }
    @keyframes sb-ripple {
      0%   { transform: translate(-50%, -50%) scale(0); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
    }
    @keyframes sb-laser-pulse {
      0%   { transform: translate(-50%, -50%) scale(0.5); opacity: 1; border-width: 4px; }
      100% { transform: translate(-50%, -50%) scale(2);   opacity: 0; border-width: 1px; }
    }
  `;
  document.head.appendChild(style);
}

// ─── Cursor modes ──────────────────────────────────────────────────────────────
function setCursorMode(mode: CursorMode): void {
  activeCursorMode = mode;
  applyCursorMode(mode);
}

function applyCursorMode(mode: CursorMode): void {
  cleanupCursor();
  activeCursorMode = mode;

  cursorEl = document.createElement('div');
  cursorEl.id = 'sb-cursor';
  Object.assign(cursorEl.style, {
    position: 'fixed', pointerEvents: 'none',
    // Keep below the toolbar container (2147483647) so the drag handle
    // is always reachable and the grab cursor isn't obscured by the SVG arrow.
    zIndex: '2147483645', left: '0', top: '0',
  });

  const arrowSvg = (fill: string, stroke: string) =>
    `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 2L25 20L15.5 21L11.5 30L7 2Z" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>
    </svg>`;

  switch (mode) {
    case 'default':
    case 'spotlight':
      cursorEl.innerHTML = arrowSvg('white', 'rgba(0,0,0,0.4)');
      break;
    case 'ripple':
      cursorEl.innerHTML = arrowSvg('black', 'white');
      break;
    case 'black':
      cursorEl.innerHTML = arrowSvg('black', 'white');
      cursorEl.style.width  = '40px';
      cursorEl.style.height = '40px';
      cursorEl.querySelector('svg')?.setAttribute('width',  '40');
      cursorEl.querySelector('svg')?.setAttribute('height', '40');
      break;
    case 'laser':
      Object.assign(cursorEl.style, {
        width: '12px', height: '12px',
        background: '#FF453A', borderRadius: '50%',
        boxShadow: '0 0 8px 4px rgba(255,69,58,0.6), 0 0 2px 1px #FF453A',
        transform: 'translate(-50%,-50%)',
      });
      break;
  }

  document.body.appendChild(cursorEl);

  mouseMoveHandler = (e: MouseEvent) => {
    if (!cursorEl) return;
    cursorEl.style.left = e.clientX + 'px';
    cursorEl.style.top  = e.clientY + 'px';
    if (mode === 'spotlight') updateSpotlight(e);
  };
  document.addEventListener('mousemove', mouseMoveHandler, true);

  if (mode === 'ripple' || mode === 'laser') {
    mouseClickHandler = (e: MouseEvent) => spawnRipple(e.clientX, e.clientY, mode);
    document.addEventListener('mousedown', mouseClickHandler, true);
  }

  if (mode === 'spotlight') initSpotlight();
}

function cleanupCursor(): void {
  cursorEl?.remove();
  cursorEl = null;
  if (mouseMoveHandler)  { document.removeEventListener('mousemove',  mouseMoveHandler,  true); mouseMoveHandler  = null; }
  if (mouseClickHandler) { document.removeEventListener('mousedown', mouseClickHandler, true); mouseClickHandler = null; }
  removeSpotlight();
}

function spawnRipple(x: number, y: number, mode: CursorMode): void {
  const r = document.createElement('div');
  Object.assign(r.style, {
    position: 'fixed', left: x + 'px', top: y + 'px',
    width: '60px', height: '60px', borderRadius: '50%',
    pointerEvents: 'none', zIndex: '2147483644',
    background: mode === 'laser' ? 'none' : 'rgba(94,92,230,0.4)',
    border: mode === 'laser' ? '2px solid #FF453A' : 'none',
    animation: mode === 'laser' ? 'sb-laser-pulse 0.4s ease-out forwards' : 'sb-ripple 0.4s ease-out forwards',
  });
  document.body.appendChild(r);
  setTimeout(() => r.remove(), 400);
}

function initSpotlight(): void {
  if (spotlightOverlay) return;
  spotlightOverlay = document.createElement('div');
  Object.assign(spotlightOverlay.style, {
    position: 'fixed', inset: '0', pointerEvents: 'none',
    zIndex: '2147483643', background: 'rgba(0,0,0,0.45)',
  });
  document.body.appendChild(spotlightOverlay);
}

function updateSpotlight(e: MouseEvent): void {
  if (!spotlightOverlay) return;
  const mask = `radial-gradient(circle 90px at ${e.clientX}px ${e.clientY}px, transparent 88px, black 90px)`;
  spotlightOverlay.style.webkitMaskImage = mask;
  (spotlightOverlay.style as any).maskImage = mask;
}

function removeSpotlight(): void {
  spotlightOverlay?.remove();
  spotlightOverlay = null;
}
