// dev-capture.ts — injected into MAIN world via <script> tag
// Patches console.error/warn, fetch, XHR and sends captured events back to
// the isolated content script via window.postMessage.
// NOT included in the prod Chrome store build — only used when sb_dev_mode=true.

(function () {
  if ((window as any).__sb_dev_capture_active) return;
  (window as any).__sb_dev_capture_active = true;

  function emit(entry: object) {
    window.postMessage({ source: 'sb-dev', ...entry }, '*');
  }

  // ── Console ──────────────────────────────────────────────────────────────
  const _error = console.error.bind(console);
  const _warn  = console.warn.bind(console);

  console.error = function (...args: any[]) {
    emit({ type: 'console_error', message: args.map(String).join(' '), ts: Date.now() });
    _error(...args);
  };

  console.warn = function (...args: any[]) {
    emit({ type: 'console_warn', message: args.map(String).join(' '), ts: Date.now() });
    _warn(...args);
  };

  // ── Uncaught errors ───────────────────────────────────────────────────────
  window.addEventListener('error', (e) => {
    emit({ type: 'uncaught_error', message: e.message, stack: e.error?.stack ?? '', ts: Date.now() });
  });

  window.addEventListener('unhandledrejection', (e) => {
    emit({ type: 'uncaught_error', message: String(e.reason), stack: e.reason?.stack ?? '', ts: Date.now() });
  });

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const _fetch = window.fetch.bind(window);
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const ts = Date.now();
    try {
      const res = await _fetch(input, init);
      if (!res.ok) {
        emit({ type: 'network_error', url, method, status: res.status, ts });
      }
      return res;
    } catch (err: any) {
      emit({ type: 'network_error', url, method, status: 0, message: err?.message ?? 'fetch failed', ts });
      throw err;
    }
  };

  // ── XHR ───────────────────────────────────────────────────────────────────
  const _XHROpen = XMLHttpRequest.prototype.open;
  const _XHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
    (this as any).__sb_method = method;
    (this as any).__sb_url    = String(url);
    return _XHROpen.apply(this, [method, url, ...rest] as any);
  };

  XMLHttpRequest.prototype.send = function (...args: any[]) {
    const ts = Date.now();
    this.addEventListener('loadend', () => {
      if (this.status === 0 || this.status >= 400) {
        emit({
          type: 'network_error',
          url: (this as any).__sb_url,
          method: (this as any).__sb_method ?? 'XHR',
          status: this.status,
          ts,
        });
      }
    });
    return _XHRSend.apply(this, args as any);
  };
})();
