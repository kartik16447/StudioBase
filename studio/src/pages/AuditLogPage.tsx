import React, { useEffect, useState, useCallback, useRef } from 'react';
import { apiClient } from '../lib/apiClient';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AuditEntry {
  id: string;
  timestamp: number;
  actorId: string;
  action: string;
  targetId: string;
  metadata: string;
  workspaceId: string;
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const ACTION_TONE: Record<string, { bg: string; fg: string; dot: string }> = {
  'session.create':           { bg: 'rgba(94,92,230,.10)',  fg: '#5E5CE6', dot: '#5E5CE6' },
  'capture.export':           { bg: 'rgba(0,0,0,.05)',      fg: '#1D1D1F', dot: '#6E6E73' },
  'admin.invite':             { bg: 'rgba(255,159,10,.12)', fg: '#B86E00', dot: '#FF9F0A' },
  'role.update':              { bg: 'rgba(255,159,10,.12)', fg: '#B86E00', dot: '#FF9F0A' },
  'audit_log.exported':       { bg: 'rgba(52,199,89,.12)',  fg: '#1E8E3E', dot: '#34C759' },
  'workspace.access_denied':  { bg: 'rgba(255,69,58,.10)',  fg: '#C4271F', dot: '#FF453A' },
};

function actionTone(action: string) {
  if (ACTION_TONE[action]) return ACTION_TONE[action];
  if (action.includes('denied') || action.includes('fail') || action.includes('error'))
    return { bg: 'rgba(255,69,58,.10)', fg: '#C4271F', dot: '#FF453A' };
  if (action.includes('admin') || action.includes('role') || action.includes('invite'))
    return { bg: 'rgba(255,159,10,.12)', fg: '#B86E00', dot: '#FF9F0A' };
  if (action.includes('export') || action.includes('delete'))
    return { bg: 'rgba(52,199,89,.12)', fg: '#1E8E3E', dot: '#34C759' };
  return { bg: 'rgba(94,92,230,.10)', fg: '#5E5CE6', dot: '#5E5CE6' };
}

// deterministic gradient from actorId string
function actorGrad(id: string): [string, string] {
  const h = id.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
  const grads: [string, string][] = [
    ['#FF6B9D', '#FF453A'], ['#5E5CE6', '#BF5AF2'], ['#34C759', '#30B0C7'],
    ['#FF9F0A', '#FF6B9D'], ['#30B0C7', '#5E5CE6'], ['#BF5AF2', '#FF453A'],
  ];
  return grads[Math.abs(h) % grads.length];
}

function initials(id: string) { return (id || '??').slice(0, 2).toUpperCase(); }

// ─── Inline icons ─────────────────────────────────────────────────────────────
const Ic = {
  Search: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="4.25"/><path d="m13.5 13.5-3-3"/>
    </svg>
  ),
  Calendar: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.25" y="3.5" width="11.5" height="10" rx="2"/><path d="M2.25 6.5h11.5M5.5 2v2.5M10.5 2v2.5"/>
    </svg>
  ),
  Download: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v8m0 0 3-3m-3 3L5 7M3 12.5h10"/>
    </svg>
  ),
  ChevronD: ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m4 6 4 4 4-4"/>
    </svg>
  ),
  ChevronR: ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 4 4 4-4 4"/>
    </svg>
  ),
  ChevronL: ({ size = 12 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m10 4-4 4 4 4"/>
    </svg>
  ),
  X: () => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3.5 3.5l9 9m0-9-9 9"/>
    </svg>
  ),
  Check: () => (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 8.5 3 3 7-7"/>
    </svg>
  ),
  Copy: () => (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5.25" y="5.25" width="8.5" height="8.5" rx="1.5"/>
      <path d="M10.75 5.25V3.75A1.5 1.5 0 0 0 9.25 2.25H3.75A1.5 1.5 0 0 0 2.25 3.75v5.5a1.5 1.5 0 0 0 1.5 1.5h1.5"/>
    </svg>
  ),
  Activity: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 8h3l2-5 3 10 2-5h3"/>
    </svg>
  ),
  Shield: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.5 2.5 3.5v5c0 3 2.5 5.25 5.5 6 3-.75 5.5-3 5.5-6v-5L8 1.5z"/>
    </svg>
  ),
  Users: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="2.5"/><path d="M1.5 13c.5-2.25 2.5-3.5 4.5-3.5s4 1.25 4.5 3.5M11 7a2 2 0 1 0 0-4M14.5 13c-.25-1.5-1.25-2.5-2.5-3"/>
    </svg>
  ),
  Bolt: () => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 1.5 3 9h4l-.5 5.5L12 7H8l.5-5.5z"/>
    </svg>
  ),
  TrendUp: () => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m2.5 11 4-4 2.5 2.5L13.5 5M10 5h3.5v3.5"/>
    </svg>
  ),
  Doc: () => (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 1.5H3.5v13h9V4.5l-3-3zM9 1.5V5h3.5M5.5 8h5M5.5 10.5h5M5.5 6h2"/>
    </svg>
  ),
};

// ─── Avatar ───────────────────────────────────────────────────────────────────
const AuditAvatar: React.FC<{ actorId: string; size?: number }> = ({ actorId, size = 22 }) => {
  const [g1, g2] = actorGrad(actorId);
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `linear-gradient(135deg, ${g1}, ${g2})`,
      display: 'grid', placeItems: 'center',
      color: '#fff', fontSize: size * 0.42, fontWeight: 600,
      flexShrink: 0, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.2)',
    }}>
      {initials(actorId)}
    </div>
  );
};

// ─── Action badge ─────────────────────────────────────────────────────────────
const ActionBadge: React.FC<{ action: string }> = ({ action }) => {
  const t = actionTone(action);
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 8px 3px 7px', borderRadius: 999,
      background: t.bg, color: t.fg,
      fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono, ui-monospace)',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: t.dot, flexShrink: 0 }} />
      {action}
    </div>
  );
};

// ─── Copyable ID ──────────────────────────────────────────────────────────────
const CopyableId: React.FC<{ id: string }> = ({ id }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '2px 7px 2px 8px', borderRadius: 6,
        background: 'rgba(0,0,0,.035)', border: '1px solid rgba(0,0,0,.05)',
        color: copied ? '#1E8E3E' : '#1D1D1F', fontSize: 12,
        fontFamily: 'ui-monospace', fontWeight: 500, cursor: 'pointer',
        maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {copied ? 'Copied' : id}
      </span>
      {copied ? <Ic.Check /> : <Ic.Copy />}
    </button>
  );
};

// ─── Expanded row ─────────────────────────────────────────────────────────────
const ExpandedRow: React.FC<{ entry: AuditEntry }> = ({ entry }) => {
  let parsedMeta: any = {};
  try { parsedMeta = JSON.parse(entry.metadata || '{}'); } catch { parsedMeta = { raw: entry.metadata }; }

  const fullPayload = {
    event_id: entry.id,
    timestamp: new Date(entry.timestamp).toISOString(),
    actor: { id: entry.actorId },
    action: entry.action,
    target: { id: entry.targetId },
    result: 'success',
    ...parsedMeta,
  };

  const highlighted = JSON.stringify(fullPayload, null, 2)
    .replace(/("(?:\\.|[^"\\])*"\s*):/g, '<span style="color:#A78BFA">$1</span>:')
    .replace(/:\s*("(?:\\.|[^"\\])*")/g, ': <span style="color:#86EFAC">$1</span>')
    .replace(/\b(true|false)\b/g, '<span style="color:#FCD34D">$1</span>')
    .replace(/\bnull\b/g, '<span style="color:#9CA3AF">null</span>')
    .replace(/(:\s*)(-?\d+\.?\d*)/g, '$1<span style="color:#FCA5A5">$2</span>');

  return (
    <tr>
      <td colSpan={5} style={{ padding: 0, background: 'rgba(94,92,230,.025)' }}>
        <div style={{
          padding: '18px 24px 22px 56px',
          borderTop: '1px solid rgba(0,0,0,.05)',
          borderBottom: '1px solid rgba(0,0,0,.05)',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 28 }}>
            {/* Meta facts */}
            <div style={{ width: 280, flexShrink: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#6E6E73', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
                Event details
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', rowGap: 8, columnGap: 10, fontSize: 12.5 }}>
                <div style={{ color: '#6E6E73' }}>Event ID</div>
                <div style={{ fontFamily: 'ui-monospace', color: '#1D1D1F', fontSize: 11 }}>{entry.id}</div>
                <div style={{ color: '#6E6E73' }}>Actor ID</div>
                <div style={{ fontFamily: 'ui-monospace', color: '#1D1D1F', fontSize: 11 }}>{entry.actorId}</div>
                <div style={{ color: '#6E6E73' }}>Target ID</div>
                <div style={{ fontFamily: 'ui-monospace', color: '#1D1D1F', fontSize: 11 }}>{entry.targetId || '—'}</div>
                <div style={{ color: '#6E6E73' }}>Workspace</div>
                <div style={{ fontFamily: 'ui-monospace', color: '#1D1D1F', fontSize: 11 }}>{entry.workspaceId}</div>
                <div style={{ color: '#6E6E73' }}>Result</div>
                <div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 7px', borderRadius: 999, background: 'rgba(52,199,89,.12)', color: '#1E8E3E', fontSize: 11.5, fontWeight: 600 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#34C759' }} />
                    Success
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,.1)', background: '#fff', color: '#1D1D1F', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                  <Ic.Activity /> View related
                </button>
                <button onClick={() => navigator.clipboard?.writeText(JSON.stringify(fullPayload, null, 2))}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,.1)', background: '#fff', color: '#1D1D1F', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                  <Ic.Copy /> Copy event
                </button>
              </div>
            </div>

            {/* JSON payload */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: '#6E6E73', textTransform: 'uppercase', letterSpacing: '.06em' }}>Full payload · JSON</div>
                <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 999, background: 'rgba(0,0,0,.05)', color: '#6E6E73', fontFamily: 'ui-monospace' }}>application/json</span>
              </div>
              <pre style={{
                margin: 0, padding: '14px 16px',
                background: '#1D1D1F', color: '#F5F5F7',
                borderRadius: 10, fontSize: 12, lineHeight: 1.55,
                overflow: 'auto', maxHeight: 280,
                fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
              }} dangerouslySetInnerHTML={{ __html: highlighted }} />
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
};

// ─── Export Drawer ────────────────────────────────────────────────────────────
const ExportDrawer: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 89);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ url: string; rows: number; key: string } | null>(null);
  const [secs, setSecs] = useState(900);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (!result) return;
    setSecs(900);
    timerRef.current = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timerRef.current);
  }, [result]);

  const onGenerate = async () => {
    setGenerating(true);
    try {
      const fromMs = new Date(from).getTime();
      const toMs = new Date(to + 'T23:59:59').getTime();
      const data = await apiClient.get<{ url: string; rows: number; key: string }>(
        `/audit-logs/export?from=${fromMs}&to=${toMs}`
      );
      setResult(data);
    } catch (e: any) {
      alert('Export failed: ' + e.message);
    } finally {
      setGenerating(false);
    }
  };

  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');

  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, pointerEvents: 'none' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(29,29,31,.32)', backdropFilter: 'blur(2px)', pointerEvents: 'auto' }} />
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 460,
        background: '#fff', borderLeft: '1px solid rgba(0,0,0,.08)',
        boxShadow: '-20px 0 60px rgba(0,0,0,.18)',
        display: 'flex', flexDirection: 'column', pointerEvents: 'auto',
        animation: 'sb-slidein .22s cubic-bezier(.2,.7,.2,1)',
      }}>
        <style>{`@keyframes sb-slidein { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(0,0,0,.07)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(94,92,230,.08)', color: '#5E5CE6', display: 'grid', placeItems: 'center' }}>
                <Ic.Download />
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#5E5CE6', textTransform: 'uppercase', letterSpacing: '.06em' }}>Export audit log</div>
            </div>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: '-.015em', color: '#1D1D1F' }}>Generate signed export</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6E6E73' }}>Exports are signed for 15 minutes. JSONL format.</p>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, padding: 0, border: 0, background: 'rgba(0,0,0,.05)', borderRadius: 7, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <Ic.X />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Date range */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Date range</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {([{ label: 'From', v: from, set: setFrom }, { label: 'To', v: to, set: setTo }] as const).map((f) => (
                <label key={f.label} style={{ display: 'block' }}>
                  <div style={{ fontSize: 11.5, color: '#6E6E73', marginBottom: 5 }}>{f.label}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', border: '1px solid rgba(0,0,0,.1)', borderRadius: 9, background: '#fff' }}>
                    <Ic.Calendar />
                    <input type="date" value={f.v} onChange={(e) => f.set(e.target.value)}
                      style={{ flex: 1, border: 0, outline: 'none', background: 'transparent', fontFamily: 'ui-monospace', fontSize: 13, color: '#1D1D1F' }} />
                  </div>
                </label>
              ))}
            </div>
            {/* Quick ranges */}
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {(['Last 24h', 'Last 7d', 'Last 30d', 'Last 90d'] as const).map((p, i) => {
                const days = [1, 7, 30, 90][i];
                return (
                  <button key={p} onClick={() => {
                    const d = new Date(); d.setDate(d.getDate() - days);
                    setFrom(d.toISOString().slice(0, 10));
                    setTo(new Date().toISOString().slice(0, 10));
                  }} style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid rgba(0,0,0,.1)', background: '#fff', color: '#1D1D1F', fontSize: 11.5, fontWeight: 500, cursor: 'pointer' }}>
                    {p}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Format */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Format</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ padding: '9px 14px', borderRadius: 10, background: 'rgba(94,92,230,.08)', border: '1px solid #5E5CE6', color: '#5E5CE6', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Ic.Check /><span style={{ fontFamily: 'ui-monospace' }}>JSONL</span>
                <span style={{ opacity: .7, fontWeight: 500 }}>· newline-delimited</span>
              </div>
              <div style={{ padding: '9px 14px', borderRadius: 10, border: '1px dashed rgba(0,0,0,.12)', color: '#AEAEB2', fontSize: 13, fontWeight: 500 }}>
                <span style={{ fontFamily: 'ui-monospace' }}>CSV</span>
                <span style={{ marginLeft: 8, fontSize: 10.5, padding: '1px 6px', borderRadius: 999, background: 'rgba(0,0,0,.04)', color: '#6E6E73' }}>Soon</span>
              </div>
            </div>
          </section>

          {/* Preview */}
          {result && (
            <section>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6E6E73', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Preview</div>
              <div style={{ padding: '14px 16px', border: '1px solid rgba(0,0,0,.07)', borderRadius: 12, background: 'linear-gradient(180deg, rgba(94,92,230,.04), rgba(94,92,230,.0))', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(94,92,230,.12)', color: '#5E5CE6', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Ic.Doc />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#1D1D1F', letterSpacing: '-.01em' }}>
                    {result.rows.toLocaleString()} events
                  </div>
                  <div style={{ fontSize: 12, color: '#6E6E73' }}>
                    {from} → {to}
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid rgba(0,0,0,.07)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12, background: 'rgba(0,0,0,.012)' }}>
          {result && (
            <div style={{ padding: 14, borderRadius: 12, background: '#fff', border: '1px solid rgba(0,0,0,.08)', boxShadow: '0 1px 2px rgba(0,0,0,.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34C759', boxShadow: '0 0 0 3px rgba(52,199,89,.18)' }} />
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1D1D1F' }}>Signed URL ready</div>
                <div style={{ flex: 1 }} />
                <div style={{ fontSize: 12, color: secs < 60 ? '#FF453A' : '#6E6E73', padding: '2px 8px', borderRadius: 999, background: secs < 60 ? 'rgba(255,69,58,.10)' : 'rgba(0,0,0,.04)', fontWeight: 600, fontFamily: 'ui-monospace' }}>
                  expires in {mm}:{ss}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(0,0,0,.03)', border: '1px solid rgba(0,0,0,.05)' }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: '#1D1D1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'ui-monospace' }}>{result.url}</span>
                <button onClick={() => navigator.clipboard?.writeText(result.url)} style={{ padding: '4px 10px', borderRadius: 6, background: '#fff', border: '1px solid rgba(0,0,0,.1)', fontSize: 12, fontWeight: 600, color: '#1D1D1F', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Ic.Copy /> Copy
                </button>
              </div>
              <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: 'rgba(0,0,0,.06)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(secs / 900) * 100}%`, background: secs < 60 ? '#FF453A' : '#5E5CE6', transition: 'width 1s linear, background .2s' }} />
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ flex: '0 0 auto', padding: '11px 16px', borderRadius: 10, border: '1px solid rgba(0,0,0,.12)', background: '#fff', color: '#1D1D1F', fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
            <button onClick={onGenerate} disabled={generating} style={{ flex: 1, padding: '11px 16px', borderRadius: 10, border: 0, background: '#5E5CE6', color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: generating ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: generating ? .7 : 1, boxShadow: '0 1px 2px rgba(94,92,230,.4), inset 0 1px 0 rgba(255,255,255,.18)' }}>
              {generating
                ? <><svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="2"/><path d="M7 2 a5 5 0 0 1 5 5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><animateTransform attributeName="transform" type="rotate" from="0 7 7" to="360 7 7" dur="0.7s" repeatCount="indefinite"/></path></svg> Generating…</>
                : <><Ic.Bolt /> {result ? 'Regenerate export' : 'Generate export'}</>}
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: '#AEAEB2', textAlign: 'center' }}>Exports signed with HMAC-SHA256 · SOC 2 Type II</div>
        </div>
      </div>
    </div>
  );
};

// ─── Filter pill ──────────────────────────────────────────────────────────────
const FilterPill: React.FC<{ label: string; value?: string; open: boolean; active: boolean; onClick: () => void }> = ({ label, value, open, active, onClick }) => (
  <button onClick={onClick} style={{
    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 999, fontSize: 13,
    background: open ? 'rgba(94,92,230,.08)' : '#fff',
    border: open ? '1px solid #5E5CE6' : '1px solid rgba(0,0,0,.1)',
    color: open ? '#5E5CE6' : '#1D1D1F',
    fontWeight: active || open ? 600 : 500, cursor: 'pointer',
    boxShadow: open ? '0 0 0 3px rgba(94,92,230,.12)' : '0 1px 1px rgba(0,0,0,.02)',
  }}>
    <span style={{ color: open ? '#5E5CE6' : '#6E6E73' }}>{label}</span>
    {value && <><span style={{ color: open ? '#5E5CE6' : '#AEAEB2' }}>·</span><span>{value}</span></>}
    <Ic.ChevronD size={11} />
  </button>
);

const ACTION_TYPES = [
  'All actions', 'session.create', 'capture.export', 'admin.invite',
  'role.update', 'audit_log.exported', 'workspace.access_denied',
];

const PAGE_LIMIT = 20;

// ─── Stat card ────────────────────────────────────────────────────────────────
const SummaryCard: React.FC<{ label: string; value: string | number; sub: string; tone?: 'warning' | 'danger' | 'normal'; icon: React.ReactNode; accent: string }> = ({ label, value, sub, tone, icon, accent }) => (
  <div style={{ background: '#fff', borderRadius: 16, padding: 18, border: '1px solid rgba(0,0,0,.06)', boxShadow: '0 1px 3px rgba(0,0,0,.04)', display: 'flex', flexDirection: 'column', gap: 6, position: 'relative', overflow: 'hidden' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: `${accent}1A`, color: accent, display: 'grid', placeItems: 'center' }}>{icon}</div>
        <div style={{ fontSize: 12.5, color: '#6E6E73', fontWeight: 500 }}>{label}</div>
      </div>
      {tone === 'warning' && <div style={{ fontSize: 10.5, padding: '2px 6px', borderRadius: 999, background: 'rgba(255,159,10,.12)', color: '#FF9F0A', fontWeight: 600 }}>REVIEW</div>}
      {tone === 'danger' && <div style={{ fontSize: 10.5, padding: '2px 6px', borderRadius: 999, background: 'rgba(255,69,58,.12)', color: '#FF453A', fontWeight: 600 }}>HIGH</div>}
    </div>
    <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-.025em', lineHeight: 1.1, color: '#1D1D1F' }}>{value}</div>
    <div style={{ fontSize: 12, color: '#AEAEB2' }}>{sub}</div>
  </div>
);

// ─── Main page ────────────────────────────────────────────────────────────────
export const AuditLogPage: React.FC = () => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Filters
  const [q, setQ] = useState('');
  const [actionFilter, setActionFilter] = useState('All actions');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchLogs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(PAGE_LIMIT + 1), offset: String(offset) });
    apiClient.get<{ data: AuditEntry[] }>(`/audit-logs?${params}`)
      .then(res => {
        const rows = res.data || [];
        setHasMore(rows.length > PAGE_LIMIT);
        setEntries(rows.slice(0, PAGE_LIMIT));
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [offset]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Client-side filter
  const filtered = entries.filter(e => {
    if (actionFilter !== 'All actions' && e.action !== actionFilter) return false;
    if (q) {
      const hay = (e.action + ' ' + e.actorId + ' ' + e.targetId + ' ' + e.id).toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  // Derived stats from current page
  const stats = {
    total: entries.length + offset + (hasMore ? 1 : 0),
    exports: entries.filter(e => e.action.includes('export')).length,
    admin: entries.filter(e => e.action.includes('admin') || e.action.includes('role')).length,
    actors: new Set(entries.map(e => e.actorId)).size,
  };

  const s = { fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, sans-serif', fontSize: 14, color: '#1D1D1F', lineHeight: 1.45, WebkitFontSmoothing: 'antialiased' as const };

  return (
    <div style={{ ...s, flex: 1, minHeight: 0, overflowY: 'auto', padding: '28px 36px 60px', background: '#F5F5F7' }}>

      {/* Page header */}
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6E6E73', fontSize: 12.5, marginBottom: 8 }}>
            <span>Workspace</span><span style={{ color: '#AEAEB2' }}>/</span>
            <span>Security</span><span style={{ color: '#AEAEB2' }}>/</span>
            <span style={{ color: '#1D1D1F' }}>Audit logs</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: '-.02em', color: '#1D1D1F' }}>Audit Logs</h1>
          <p style={{ margin: '6px 0 0', color: '#6E6E73', fontSize: 14.5 }}>Complete record of workspace activity. Queryable, exportable.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', border: '1px solid rgba(0,0,0,.1)', background: '#fff', borderRadius: 10, color: '#1D1D1F', fontSize: 13, fontWeight: 500, cursor: 'pointer', boxShadow: '0 1px 1px rgba(0,0,0,.02)' }}>
            <Ic.Calendar /> Last 90 days <Ic.ChevronD />
          </button>
          <button onClick={() => setDrawerOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', border: '1px solid rgba(0,0,0,.1)', background: '#fff', borderRadius: 10, color: '#1D1D1F', fontSize: 13, fontWeight: 500, cursor: 'pointer', boxShadow: '0 1px 1px rgba(0,0,0,.02)' }}>
            <Ic.Download /> Export JSONL
          </button>
        </div>
      </header>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        <SummaryCard label="Total events" value={stats.total} sub="this page" icon={<Ic.Activity />} accent="#5E5CE6" />
        <SummaryCard label="Unique actors" value={stats.actors} sub="of all seats active" icon={<Ic.Users />} accent="#30B0C7" />
        <SummaryCard label="Export events" value={stats.exports} sub="this period" icon={<Ic.Download />} accent="#FF453A" tone={stats.exports > 5 ? 'danger' : undefined} />
        <SummaryCard label="Admin actions" value={stats.admin} sub="role & invite changes" icon={<Ic.Shield />} accent="#FF9F0A" tone={stats.admin > 3 ? 'warning' : undefined} />
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(255,69,58,.08)', border: '1px solid rgba(255,69,58,.2)', color: '#C4271F', borderRadius: 10, fontSize: 13 }}>
          {error.includes('403') ? 'Admin access required to view workspace audit logs.' : error}
        </div>
      )}

      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: '#fff', border: '1px solid rgba(0,0,0,.07)', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,.04)', marginBottom: 16 }}>
        {/* Search */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'rgba(0,0,0,.03)', border: '1px solid transparent', borderRadius: 10, maxWidth: 360 }}>
          <Ic.Search />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search actions, actors…"
            style={{ flex: 1, border: 0, background: 'transparent', outline: 'none', fontSize: 13.5, color: '#1D1D1F', fontFamily: 'inherit' }} />
          <span style={{ fontSize: 10.5, padding: '2px 5px', borderRadius: 4, background: '#fff', border: '1px solid rgba(0,0,0,.1)', color: '#AEAEB2' }}>/</span>
        </div>

        {/* Action type filter */}
        <div style={{ position: 'relative' }}>
          <FilterPill label="Action type" value={actionFilter !== 'All actions' ? actionFilter : undefined} open={openMenu === 'action'} active={actionFilter !== 'All actions'} onClick={() => setOpenMenu(openMenu === 'action' ? null : 'action')} />
          {openMenu === 'action' && (
            <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 30, minWidth: 280, background: '#fff', border: '1px solid rgba(0,0,0,.1)', borderRadius: 12, boxShadow: '0 18px 50px rgba(20,20,30,.18)', padding: 6 }}>
              <div style={{ padding: '8px 10px 6px', fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', color: '#AEAEB2', textTransform: 'uppercase' }}>Action type</div>
              {ACTION_TYPES.map(a => (
                <button key={a} onClick={() => { setActionFilter(a); setOpenMenu(null); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: 0, background: actionFilter === a ? 'rgba(94,92,230,.08)' : 'transparent', borderRadius: 8, cursor: 'pointer', textAlign: 'left', color: actionFilter === a ? '#5E5CE6' : '#1D1D1F', fontSize: 13, fontWeight: actionFilter === a ? 600 : 500, fontFamily: 'ui-monospace' }}>
                  {a}
                  {actionFilter === a && <span style={{ marginLeft: 'auto' }}><Ic.Check /></span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />
        <button onClick={() => { setQ(''); setActionFilter('All actions'); setOpenMenu(null); }}
          style={{ background: 'transparent', border: 0, color: '#6E6E73', fontSize: 13, fontWeight: 500, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Ic.X /> Clear filters
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid rgba(0,0,0,.07)', padding: '80px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#AEAEB2', fontSize: 13 }}>
          Loading events…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid rgba(0,0,0,.07)', padding: '80px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(94,92,230,.08)', display: 'grid', placeItems: 'center' }}><Ic.Search /></div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: '#1D1D1F' }}>No events match your filters</div>
            <div style={{ fontSize: 13.5, color: '#6E6E73', marginTop: 4 }}>Try expanding the date range or removing an action filter.</div>
          </div>
          <button onClick={() => { setQ(''); setActionFilter('All actions'); }} style={{ padding: '8px 14px', borderRadius: 8, background: '#5E5CE6', color: '#fff', border: 0, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Clear filters</button>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid rgba(0,0,0,.07)', boxShadow: '0 1px 3px rgba(0,0,0,.04)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 232 }} /><col style={{ width: 220 }} /><col style={{ width: 200 }} />
              <col /><col style={{ width: 130 }} />
            </colgroup>
            <thead>
              <tr>
                {['Timestamp', 'Actor', 'Action', 'Target', ''].map((h, i) => (
                  <th key={h + i} style={{ textAlign: i === 4 ? 'right' : 'left', padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#6E6E73', textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid rgba(0,0,0,.07)', background: 'rgba(0,0,0,.015)' }}>
                    {i === 0 ? <span style={{ paddingLeft: 30 }}>{h}</span> : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const expanded = expandedId === row.id;
                return (
                  <React.Fragment key={row.id}>
                    <tr onClick={() => setExpandedId(expanded ? null : row.id)}
                      style={{ cursor: 'pointer', background: expanded ? 'rgba(94,92,230,.025)' : 'transparent', transition: 'background .12s' }}
                      onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'rgba(94,92,230,.04)'; }}
                      onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                      {/* Timestamp */}
                      <td style={{ padding: '12px 16px', paddingLeft: 24, borderBottom: '1px solid rgba(0,0,0,.05)', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button onClick={e => { e.stopPropagation(); setExpandedId(expanded ? null : row.id); }}
                            style={{ width: 18, height: 18, padding: 0, border: 0, background: expanded ? '#5E5CE6' : 'transparent', color: expanded ? '#fff' : '#AEAEB2', borderRadius: 5, display: 'grid', placeItems: 'center', cursor: 'pointer', transition: 'all .12s' }}>
                            {expanded ? <Ic.ChevronD size={12} /> : <Ic.ChevronR size={12} />}
                          </button>
                          <span style={{ fontSize: 13, color: '#AEAEB2', fontFamily: 'ui-monospace', fontVariantNumeric: 'tabular-nums' }}>
                            {new Date(row.timestamp).toLocaleString()}
                          </span>
                        </div>
                      </td>
                      {/* Actor */}
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,0,0,.05)', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <AuditAvatar actorId={row.actorId} />
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: '#1D1D1F', lineHeight: 1.2, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>{row.actorId}</div>
                          </div>
                        </div>
                      </td>
                      {/* Action */}
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,0,0,.05)', verticalAlign: 'middle' }}>
                        <ActionBadge action={row.action} />
                      </td>
                      {/* Target */}
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0,0,0,.05)', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <CopyableId id={row.targetId || row.id} />
                        </div>
                      </td>
                      {/* Details */}
                      <td style={{ padding: '12px 24px 12px 16px', borderBottom: '1px solid rgba(0,0,0,.05)', verticalAlign: 'middle', textAlign: 'right' }}>
                        <span style={{ fontSize: 12, color: expanded ? '#5E5CE6' : '#AEAEB2', fontWeight: 500 }}>
                          {expanded ? 'Hide details' : 'View details'}
                        </span>
                      </td>
                    </tr>
                    {expanded && <ExpandedRow entry={row} />}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid rgba(0,0,0,.05)', background: 'rgba(0,0,0,.012)' }}>
            <div style={{ fontSize: 12.5, color: '#6E6E73' }}>
              Showing <strong style={{ color: '#1D1D1F' }}>{offset + 1}–{offset + filtered.length}</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_LIMIT))}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7, border: '1px solid rgba(0,0,0,.1)', background: '#fff', color: '#6E6E73', fontSize: 12.5, fontWeight: 500, cursor: offset === 0 ? 'default' : 'pointer', opacity: offset === 0 ? .4 : 1 }}>
                <Ic.ChevronL /> Prev
              </button>
              <button disabled={!hasMore} onClick={() => setOffset(offset + PAGE_LIMIT)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7, border: '1px solid rgba(0,0,0,.1)', background: '#fff', color: '#1D1D1F', fontSize: 12.5, fontWeight: 500, cursor: hasMore ? 'pointer' : 'default', opacity: hasMore ? 1 : .4 }}>
                Next <Ic.ChevronR />
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 11.5, color: '#AEAEB2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Events retained for 13 months · SOC 2 Type II</span>
        <span>GET /v1/audit-logs · admin only</span>
      </div>

      <ExportDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
};
