import { startCapture, stopCapture } from './capture/dom-observer';
import { injectToolbar, removeToolbar } from './capture/toolbar';

// ─── Token Injection for Studio ─────────────────────────────
const isStudio = window.location.host.includes('localhost') ||
  window.location.host.includes('studiobase.app') ||
  window.location.host.includes('studiobase-umber.vercel.app');
if (isStudio) {
  function writeExtToken(token: string, workspaceId?: string) {
    localStorage.setItem('sb_ext_token', JSON.stringify({ token, ts: Date.now() }));
    if (workspaceId) {
      sessionStorage.setItem('sb_workspaceId', workspaceId);
      localStorage.setItem('sb_workspaceId', workspaceId);
    }
    window.dispatchEvent(new CustomEvent('SB_TOKEN_UPDATED', { detail: token }));
  }

  chrome.storage.local.get(['sb_user']).then((stored) => {
    const workspaceId = stored.sb_user?.workspaceId;
    chrome.runtime.sendMessage({ type: 'GET_FRESH_TOKEN' }, (response) => {
      if (chrome.runtime.lastError || !response?.token) return;
      writeExtToken(response.token, workspaceId);
    });
  }).catch(() => {});

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.sb_user) {
      const workspaceId = changes.sb_user.newValue?.workspaceId;
      chrome.runtime.sendMessage({ type: 'GET_FRESH_TOKEN' }, (response) => {
        if (chrome.runtime.lastError || !response?.token) return;
        writeExtToken(response.token, workspaceId);
      });
    }
  });
}

// ─── Dev Capture (local testing only) ────────────────────────
// Injects a MAIN-world script that patches console/fetch/XHR and relays
// events back here via postMessage. Only active when sb_dev_mode=true.

export interface DevLogEntry {
  type: 'console_error' | 'console_warn' | 'network_error' | 'uncaught_error';
  message: string;
  url?: string;
  method?: string;
  status?: number;
  stack?: string;
  ts: number;
  stepIndex?: number;
}

let devModeActive = false;
let currentStepIndex = 0;

function injectDevCapture() {
  if (document.getElementById('__sb_dev_capture')) return;
  // Inline the capture script so it runs synchronously in MAIN world
  // (import.meta.env.DEV ensures this block is tree-shaken in prod builds)
  if (!import.meta.env.DEV) return;

  const src = `
(function(){
  if(window.__sb_dev_capture_active)return;
  window.__sb_dev_capture_active=true;
  function emit(e){window.postMessage({source:'sb-dev',...e},'*');}
  const _err=console.error.bind(console),_warn=console.warn.bind(console);
  console.error=function(...a){emit({type:'console_error',message:a.map(String).join(' '),ts:Date.now()});_err(...a);};
  console.warn=function(...a){emit({type:'console_warn',message:a.map(String).join(' '),ts:Date.now()});_warn(...a);};
  window.addEventListener('error',e=>emit({type:'uncaught_error',message:e.message,stack:e.error?.stack??'',ts:Date.now()}));
  window.addEventListener('unhandledrejection',e=>emit({type:'uncaught_error',message:String(e.reason),stack:e.reason?.stack??'',ts:Date.now()}));
  const _fetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    const method=init?.method??(input instanceof Request?input.method:'GET');
    const ts=Date.now();
    try{const r=await _fetch(input,init);if(!r.ok)emit({type:'network_error',url,method,status:r.status,ts});return r;}
    catch(e){emit({type:'network_error',url,method,status:0,message:e?.message??'fetch failed',ts});throw e;}
  };
  const _open=XMLHttpRequest.prototype.open,_send=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open=function(m,u,...r){this.__sb_m=m;this.__sb_u=String(u);return _open.apply(this,[m,u,...r]);};
  XMLHttpRequest.prototype.send=function(...a){const ts=Date.now();this.addEventListener('loadend',()=>{if(this.status===0||this.status>=400)emit({type:'network_error',url:this.__sb_u,method:this.__sb_m??'XHR',status:this.status,ts});});return _send.apply(this,a);};
})();
  `;
  const script = document.createElement('script');
  script.id = '__sb_dev_capture';
  script.textContent = src;
  (document.head || document.documentElement).appendChild(script);
}

async function appendDevLog(entry: Omit<DevLogEntry, 'stepIndex'>) {
  const stored = await chrome.storage.session.get('sb_dev_logs');
  const logs: DevLogEntry[] = stored.sb_dev_logs ?? [];
  logs.push({ ...entry, stepIndex: currentStepIndex });
  // Cap at 500 entries so storage doesn't explode
  if (logs.length > 500) logs.splice(0, logs.length - 500);
  await chrome.storage.session.set({ sb_dev_logs: logs });
}

// Listen for events from the MAIN-world injected script
window.addEventListener('message', (e) => {
  if (!devModeActive || e.source !== window || e.data?.source !== 'sb-dev') return;
  const { source: _s, ...entry } = e.data;
  appendDevLog(entry as Omit<DevLogEntry, 'stepIndex'>);
});

// Check dev mode on load and inject if enabled
chrome.storage.local.get('sb_dev_mode').then(({ sb_dev_mode }) => {
  if (sb_dev_mode) {
    devModeActive = true;
    injectDevCapture();
  }
});

// React to toggle changes without reloading the page
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !('sb_dev_mode' in changes)) return;
  devModeActive = !!changes.sb_dev_mode.newValue;
  if (devModeActive) injectDevCapture();
});

// ─── Recording messages ───────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'START_CAPTURE') {
    currentStepIndex = 0;
    startCapture();
    // Pass original startedAt so the toolbar timer doesn't reset to 0:00 on navigation
    injectToolbar(msg.startedAt ?? undefined);
  }
  if (msg.type === 'STOP_CAPTURE') {
    stopCapture();
    removeToolbar();
  }
  if (msg.type === 'STEP_CAPTURED') {
    currentStepIndex = msg.stepIndex ?? currentStepIndex + 1;
  }
});

// Self-heal: announce to the service worker that this content script is ready.
// If recording is in progress for this tab, the SW will send START_CAPTURE back.
// This handles the case where page navigation causes the toolbar to disappear and
// the onUpdated message was lost due to a SW suspension / timing race.
chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' }).catch(() => {});
