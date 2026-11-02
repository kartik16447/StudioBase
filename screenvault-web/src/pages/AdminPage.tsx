import React, { useEffect, useState, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { getUser, clearUser } from '../auth';
import { API_BASE } from '../config';

const ADMIN_EMAILS = ['karthik.upadhyay98@gmail.com', 'kartik.upadhyay@foyr.com'];

// ─── tiny shared styles ────────────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: '#0A0A0F', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '1.25rem', padding: '1.5rem',
};
const statCard = (accent?: string): React.CSSProperties => ({
  ...card, position: 'relative', overflow: 'hidden',
});
const pill = (color: string, bg: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', padding: '3px 10px',
  borderRadius: '2rem', fontSize: '0.7rem', fontWeight: 700,
  background: bg, color,
});
const btn = (variant: 'primary' | 'ghost' | 'danger' = 'primary', sm = false): React.CSSProperties => ({
  background: variant === 'primary' ? '#EA580C' : variant === 'danger' ? 'rgba(239,68,68,0.1)' : 'transparent',
  color: variant === 'primary' ? '#fff' : variant === 'danger' ? '#ef4444' : '#A1A1AA',
  border: variant === 'ghost' ? '1px solid rgba(255,255,255,0.1)' : variant === 'danger' ? '1px solid rgba(239,68,68,0.2)' : 'none',
  padding: sm ? '0.35rem 0.9rem' : '0.65rem 1.4rem',
  borderRadius: '0.6rem', fontWeight: 600, cursor: 'pointer',
  fontSize: sm ? '0.75rem' : '0.875rem',
});

// ─── event table (reused across tabs) ─────────────────────────────────────────
function EventTable({ events, onSessionClick }: { events: any[]; onSessionClick?: (sid: string) => void }) {
  const grouped = (events || []).reduce((acc: any[], ev: any) => {
    const last = acc[acc.length - 1];
    if (last && last.type === ev.type && last.sessionId === ev.sessionId) {
      last.count = (last.count || 1) + 1;
    } else acc.push({ ...ev, count: 1 });
    return acc;
  }, []);

  const th: React.CSSProperties = { padding: '0.75rem 1.25rem', fontSize: '0.7rem', color: '#52525B', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 };
  const td: React.CSSProperties = { padding: '0.75rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.04)', verticalAlign: 'middle' };

  if (!grouped.length) return <p style={{ padding: '2rem', color: '#52525B', fontSize: '0.875rem' }}>No events.</p>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead><tr style={{ background: 'rgba(255,255,255,0.01)' }}>
          {['Time', 'Event', 'Session', 'Metadata'].map(h => <th key={h} style={th}>{h}</th>)}
        </tr></thead>
        <tbody>
          {grouped.map((ev: any, i: number) => {
            const isBad = ev.type?.includes('fail') || ev.type?.includes('denied') || ev.type?.includes('not_found');
            return (
              <tr key={i} style={{ background: isBad ? 'rgba(239,68,68,0.03)' : 'transparent' }}>
                <td style={{ ...td, color: '#52525B', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{new Date(ev.createdAt).toLocaleString()}</td>
                <td style={td}>
                  <span style={pill(isBad ? '#ef4444' : '#A1A1AA', isBad ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)')}>{ev.type}</span>
                  {ev.count > 1 && <span style={{ ...pill('#f59e0b', 'rgba(245,158,11,0.1)'), marginLeft: '0.4rem' }}>{ev.count}×</span>}
                </td>
                <td style={td}>
                  {ev.sessionId
                    ? <button onClick={() => onSessionClick?.(ev.sessionId)} style={{ color: '#EA580C', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'monospace' }}>{ev.sessionId.slice(0, 8)}…</button>
                    : <span style={{ color: '#3F3F46', fontSize: '0.72rem' }}>—</span>}
                </td>
                <td style={{ ...td, color: '#71717A', fontSize: '0.72rem', fontFamily: 'monospace', maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.metadata && ev.metadata !== '{}' ? ev.metadata : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── tab: OVERVIEW ─────────────────────────────────────────────────────────────
function OverviewTab({ data, onSessionClick }: { data: any; onSessionClick: (s: string) => void }) {
  const stats = [
    { label: 'Total Users', value: data.totalUsers, sub: 'All time', accent: undefined },
    { label: 'Active Users (24h)', value: data.activeUsers, sub: 'Unique sessions', accent: undefined },
    { label: 'Total Videos', value: data.totalVideos, sub: 'Including deleted', accent: undefined },
    { label: 'Upload Success', value: `${data.upload?.successRate ?? 0}%`, sub: `${data.upload?.success}/${(data.upload?.success ?? 0) + (data.upload?.failed ?? 0)} last 30d`, accent: (data.upload?.successRate ?? 0) > 90 ? '#10b981' : '#f59e0b' },
    { label: 'Playback Success', value: `${data.playback?.successRate ?? 0}%`, sub: `${data.playback?.started} started last 30d`, accent: (data.playback?.successRate ?? 0) > 90 ? '#10b981' : '#f59e0b' },
  ];

  return (
    <>
      {/* stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        {stats.map((s, i) => (
          <div key={i} style={statCard()}>
            {s.accent && <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, background: s.accent, borderRadius: '4px 0 0 4px' }} />}
            <div style={{ fontSize: '0.8rem', color: '#71717A', marginBottom: '0.4rem' }}>{s.label}</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#fff', lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: '0.7rem', color: '#3F3F46', marginTop: '0.3rem' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* error tables */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '2rem' }}>
        {[
          { title: 'Top Upload Errors', errors: data.upload?.topErrors },
          { title: 'Top Playback Errors', errors: data.playback?.topErrors },
        ].map(({ title, errors }) => (
          <div key={title} style={card}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', marginBottom: '1.25rem' }}>{title} <span style={{ color: '#52525B', fontWeight: 400, fontSize: '0.75rem' }}>last 30d</span></h3>
            {(errors || []).length === 0
              ? <p style={{ color: '#52525B', fontSize: '0.8rem' }}>No errors 🎉</p>
              : (errors || []).map((e: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.8rem' }}>
                  <span style={{ color: '#A1A1AA', fontFamily: 'monospace' }}>{e.error || 'unknown'}</span>
                  <span style={{ color: '#ef4444', fontWeight: 700 }}>{e.count}</span>
                </div>
              ))}
          </div>
        ))}
      </div>

      {/* recent events */}
      {(data.recentEvents?.length ?? 0) > 0 && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', margin: 0 }}>Recent System Events</h2>
          </div>
          <EventTable events={data.recentEvents} onSessionClick={onSessionClick} />
        </div>
      )}
    </>
  );
}

// ─── tab: INFRASTRUCTURE ───────────────────────────────────────────────────────
function InfraTab({ data }: { data: any }) {
  const infra = data.infrastructure || {};
  const kv = infra.kvCache || {};
  const chunks = data.upload?.chunkFailures || {};
  const stuck = data.stuckVideos || {};

  const row = (label: string, value: any, color = '#fff') => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.85rem' }}>
      <span style={{ color: '#A1A1AA' }}>{label}</span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
      {/* KV Cache */}
      <div style={card}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', marginBottom: '1rem' }}>KV Token Cache <span style={{ color: '#52525B', fontSize: '0.72rem', fontWeight: 400 }}>24h</span></h3>
        <div style={{ fontSize: '2.5rem', fontWeight: 700, color: kv.hitRate > 80 ? '#10b981' : '#f59e0b', marginBottom: '0.5rem' }}>{kv.hitRate ?? 0}%</div>
        {row('Hits', kv.hits ?? 0, '#10b981')}
        {row('Misses', kv.misses ?? 0, '#f59e0b')}
        {row('Total requests', (kv.hits ?? 0) + (kv.misses ?? 0))}
      </div>

      {/* Stuck Videos */}
      <div style={card}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', marginBottom: '1rem' }}>
          Stuck Videos
          <span style={{ ...pill(stuck.count > 0 ? '#ef4444' : '#10b981', stuck.count > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)'), marginLeft: '0.5rem' }}>{stuck.count ?? 0}</span>
        </h3>
        {(stuck.items || []).length === 0
          ? <p style={{ color: '#52525B', fontSize: '0.8rem' }}>None stuck 🎉</p>
          : (stuck.items || []).map((v: any, i: number) => (
            <div key={i} style={{ padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.8rem' }}>
              <div style={{ color: '#fff', fontWeight: 500 }}>{v.title || 'Untitled'}</div>
              <div style={{ color: '#52525B', marginTop: '0.15rem' }}>{new Date(v.createdAt).toLocaleString()}</div>
            </div>
          ))}
      </div>

      {/* Chunk Failures */}
      <div style={card}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', marginBottom: '1rem' }}>Upload Chunk Failures <span style={{ color: '#52525B', fontSize: '0.72rem', fontWeight: 400 }}>7d</span></h3>
        <div style={{ fontSize: '2.5rem', fontWeight: 700, color: chunks.total > 0 ? '#ef4444' : '#10b981', marginBottom: '0.5rem' }}>{chunks.total ?? 0}</div>
        {(chunks.topErrors || []).length === 0
          ? <p style={{ color: '#52525B', fontSize: '0.8rem' }}>No chunk errors 🎉</p>
          : (chunks.topErrors || []).map((e: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.78rem' }}>
              <span style={{ color: '#A1A1AA', fontFamily: 'monospace' }}>{e.error || 'unknown'}</span>
              <span style={{ color: '#ef4444', fontWeight: 700 }}>{e.count}</span>
            </div>
          ))}
      </div>

      {/* SID-only links */}
      <div style={card}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', marginBottom: '1rem' }}>SID-Only Links <span style={{ color: '#52525B', fontSize: '0.72rem', fontWeight: 400 }}>7d</span></h3>
        <div style={{ fontSize: '2.5rem', fontWeight: 700, color: (infra.sidOnlyLinks?.count ?? 0) > 0 ? '#f59e0b' : '#10b981', marginBottom: '0.75rem' }}>{infra.sidOnlyLinks?.count ?? 0}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {(infra.sidOnlyLinks?.recentSessions || []).map((sid: string, i: number) => (
            <span key={i} style={{ ...pill('#f59e0b', 'rgba(245,158,11,0.1)'), fontFamily: 'monospace' }}>{sid.slice(0, 8)}</span>
          ))}
        </div>
      </div>

      {/* Account Pinning Failures */}
      <div style={card}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', marginBottom: '1rem' }}>Account Pin Failures <span style={{ color: '#52525B', fontSize: '0.72rem', fontWeight: 400 }}>7d</span></h3>
        <div style={{ fontSize: '2.5rem', fontWeight: 700, color: (infra.accountPinningFailures?.count ?? 0) > 0 ? '#ef4444' : '#10b981', marginBottom: '0.75rem' }}>{infra.accountPinningFailures?.count ?? 0}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {(infra.accountPinningFailures?.recentSessions || []).map((sid: string, i: number) => (
            <span key={i} style={{ ...pill('#ef4444', 'rgba(239,68,68,0.1)'), fontFamily: 'monospace' }}>{sid.slice(0, 8)}</span>
          ))}
        </div>
      </div>

      {/* IDB Errors */}
      <div style={card}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', marginBottom: '1rem' }}>IndexedDB Open Errors <span style={{ color: '#52525B', fontSize: '0.72rem', fontWeight: 400 }}>7d</span></h3>
        <div style={{ fontSize: '2.5rem', fontWeight: 700, color: (infra.idbErrors?.count ?? 0) > 0 ? '#ef4444' : '#10b981' }}>{infra.idbErrors?.count ?? 0}</div>
        <p style={{ fontSize: '0.75rem', color: '#52525B', marginTop: '0.5rem' }}>Extension storage open failures. High count = users losing recordings.</p>
      </div>
    </div>
  );
}

// ─── tab: WAITLIST ─────────────────────────────────────────────────────────────
function WaitlistTab({ token }: { token: string }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/waitlist`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json() as any;
      setData(json.waitlist || []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const approve = async (id: string) => {
    setApproving(id);
    await fetch(`${API_BASE}/admin/waitlist/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await load();
    setApproving(null);
  };

  const approved = data.filter(e => e.approvedAt);
  const pending = data.filter(e => !e.approvedAt);

  const th: React.CSSProperties = { padding: '0.75rem 1.25rem', fontSize: '0.7rem', color: '#52525B', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, textAlign: 'left' };
  const td: React.CSSProperties = { padding: '0.85rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.04)', verticalAlign: 'middle' };

  if (loading) return <div style={{ color: '#52525B', padding: '3rem', textAlign: 'center' }}>Loading waitlist…</div>;

  return (
    <>
      {/* summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total signups', value: data.length, color: '#fff' },
          { label: 'Pending', value: pending.length, color: '#f59e0b' },
          { label: 'Approved', value: approved.length, color: '#10b981' },
        ].map((s, i) => (
          <div key={i} style={card}>
            <div style={{ fontSize: '0.8rem', color: '#71717A', marginBottom: '0.3rem' }}>{s.label}</div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* table */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', margin: 0, flex: 1 }}>All Waitlist Signups</h2>
          <button onClick={load} style={btn('ghost', true)}>↻ Refresh</button>
        </div>
        {data.length === 0
          ? <p style={{ padding: '3rem', color: '#52525B', textAlign: 'center' }}>No signups yet.</p>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'rgba(255,255,255,0.01)' }}>
                {['Email', 'Signed up', 'Status', 'Action'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {data.map((entry: any) => (
                  <tr key={entry.id}>
                    <td style={{ ...td, color: '#fff', fontSize: '0.875rem', fontFamily: 'monospace' }}>{entry.email}</td>
                    <td style={{ ...td, color: '#71717A', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{new Date(entry.createdAt).toLocaleString()}</td>
                    <td style={td}>
                      {entry.approvedAt
                        ? <span style={pill('#10b981', 'rgba(16,185,129,0.1)')}>✓ Approved {new Date(entry.approvedAt).toLocaleDateString()}</span>
                        : <span style={pill('#f59e0b', 'rgba(245,158,11,0.1)')}>Pending</span>}
                    </td>
                    <td style={td}>
                      {!entry.approvedAt && (
                        <button
                          onClick={() => approve(entry.id)}
                          disabled={approving === entry.id}
                          style={{ ...btn('primary', true), opacity: approving === entry.id ? 0.5 : 1 }}
                        >
                          {approving === entry.id ? 'Approving…' : 'Approve'}
                        </button>
                      )}
                      <a
                        href={`mailto:${entry.email}?subject=You're in — Foyr Screen Recorder&body=Hey! Your Foyr Screen Recorder access is ready. Install the extension here: https://chromewebstore.google.com/detail/foyr-screen-recorder/ejaghjlljgimabjjfmkcopcaphaedldg`}
                        style={{ ...btn('ghost', true), textDecoration: 'none', display: 'inline-block', marginLeft: entry.approvedAt ? 0 : '0.5rem' }}
                      >
                        ✉ Invite
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </>
  );
}

// ─── investigation views (user / video / session) ─────────────────────────────
function UserView({ data, onSessionClick }: { data: any; onSessionClick: (s: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ ...card, textAlign: 'center' }}>
          {data.user.picture && <img src={data.user.picture} alt="" style={{ width: 72, height: 72, borderRadius: '50%', marginBottom: '0.75rem', border: '2px solid #EA580C' }} />}
          <div style={{ fontWeight: 700, color: '#fff', marginBottom: '0.25rem' }}>{data.user.name}</div>
          <div style={{ fontSize: '0.8rem', color: '#71717A', marginBottom: '1.25rem' }}>{data.user.email}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {[
              { l: 'Recordings', v: data.stats?.recordings, c: '#fff' },
              { l: 'Uploads', v: data.stats?.uploads, c: '#10b981' },
              { l: 'Playbacks', v: data.stats?.playbacks, c: '#EA580C' },
              { l: 'Failures', v: data.stats?.failures, c: '#ef4444' },
            ].map(({ l, v, c }) => (
              <div key={l} style={{ background: 'rgba(255,255,255,0.03)', padding: '0.6rem', borderRadius: '0.75rem' }}>
                <div style={{ fontSize: '0.65rem', color: '#71717A', textTransform: 'uppercase' }}>{l}</div>
                <div style={{ fontSize: '1.2rem', color: c, fontWeight: 700 }}>{v ?? 0}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={card}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', marginBottom: '0.75rem' }}>Linked Accounts</h3>
          {(data.linkedAccounts || []).map((acc: any, i: number) => (
            <div key={i} style={{ fontSize: '0.8rem', color: '#A1A1AA', padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.5rem', marginBottom: '0.4rem' }}>{acc.email}</div>
          ))}
        </div>
        <div style={card}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', marginBottom: '0.75rem' }}>Workspaces</h3>
          {(data.workspaces || []).map((w: any, i: number) => (
            <div key={i} style={{ fontSize: '0.8rem', color: '#A1A1AA', padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.5rem', marginBottom: '0.4rem', display: 'flex', justifyContent: 'space-between' }}>
              <span>{w.name || w.id}</span>
              <span style={pill('#EA580C', 'rgba(234,88,12,0.1)')}>{w.role}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>Recent Events</h3>
        </div>
        <EventTable events={data.recentEvents} onSessionClick={onSessionClick} />
      </div>
    </div>
  );
}

function VideoView({ data, onSessionClick }: { data: any; onSessionClick: (s: string) => void }) {
  const v = data.video;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <p style={{ fontSize: '0.7rem', color: '#EA580C', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.4rem' }}>Video Investigation</p>
            <h2 style={{ fontSize: '1.4rem', color: '#fff', fontWeight: 700 }}>{v.title || 'Untitled'}</h2>
            <p style={{ fontSize: '0.75rem', color: '#52525B', fontFamily: 'monospace' }}>{v.id}</p>
          </div>
          <span style={pill(v.status === 'ready' ? '#10b981' : '#f59e0b', v.status === 'ready' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)')}>{v.status?.toUpperCase()}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem' }}>
          {[
            { l: 'Account Email', val: v.accountEmail },
            { l: 'Workspace', val: v.workspaceId?.slice(0, 12) + '…' },
            { l: 'Created', val: new Date(v.createdAt).toLocaleString() },
            { l: 'File Size', val: v.fileSizeBytes ? `${(v.fileSizeBytes / 1024 / 1024).toFixed(1)} MB` : '—' },
            { l: 'Playback Events', val: data.playbackEvents?.length ?? 0 },
          ].map(({ l, val }) => (
            <div key={l} style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '0.75rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#71717A', marginBottom: '0.25rem' }}>{l}</div>
              <div style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 500 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>Playback Lifecycle</h3>
        </div>
        <EventTable events={data.playbackEvents} onSessionClick={onSessionClick} />
      </div>
    </div>
  );
}

function SessionView({ data, searchQuery }: { data: any; searchQuery: string }) {
  const grouped = (data.sessionLogs || []).reduce((acc: any[], log: any) => {
    const last = acc[acc.length - 1];
    if (last && last.tag === log.tag && last.source === log.source) {
      last.count = (last.count || 1) + 1;
    } else acc.push({ ...log, count: 1 });
    return acc;
  }, []);

  const th: React.CSSProperties = { padding: '0.75rem 1.25rem', fontSize: '0.7rem', color: '#52525B', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, textAlign: 'left' };
  const td: React.CSSProperties = { padding: '0.75rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.04)', verticalAlign: 'middle' };

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#fff' }}>Session Trace</h2>
        <span style={{ fontSize: '0.72rem', color: '#52525B', fontFamily: 'monospace' }}>{searchQuery} · {grouped.length} events</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: 'rgba(255,255,255,0.01)' }}>
            {['Time', 'Tag', 'Source', 'Data'].map(h => <th key={h} style={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {grouped.map((log: any, i: number) => {
              const isErr = log.tag?.includes('ERROR') || log.tag?.includes('FAILED');
              const isOk = log.tag?.includes('COMPLETE') || log.tag?.includes('SUCCESS');
              return (
                <tr key={i} style={{ background: isErr ? 'rgba(239,68,68,0.04)' : isOk ? 'rgba(16,185,129,0.04)' : 'transparent' }}>
                  <td style={{ ...td, color: '#52525B', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{new Date(log.timestamp).toLocaleString()}</td>
                  <td style={td}>
                    <span style={{ color: isErr ? '#ef4444' : isOk ? '#10b981' : '#fff', fontSize: '0.82rem', fontWeight: 600 }}>{log.tag}</span>
                    {log.count > 1 && <span style={{ ...pill('#f59e0b', 'rgba(245,158,11,0.1)'), marginLeft: '0.4rem' }}>{log.count}× retries</span>}
                  </td>
                  <td style={td}><span style={pill(log.source === 'extension' ? '#EA580C' : '#8b5cf6', log.source === 'extension' ? 'rgba(234,88,12,0.1)' : 'rgba(139,92,246,0.1)')}>{log.source?.toUpperCase()}</span></td>
                  <td style={{ ...td, color: '#71717A', fontSize: '0.72rem', fontFamily: 'monospace', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.data}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────
export function AdminPage() {
  const user = getUser();
  const isAdmin = ADMIN_EMAILS.includes(user?.email ?? '');
  const navigate = useNavigate();

  const [tab, setTab] = useState<'overview' | 'infra' | 'waitlist'>('overview');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [investigationData, setInvestigationData] = useState<any>(null);

  const fetchGlobal = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin`, { headers: { Authorization: `Bearer ${user?.accessToken}` } });
      if (res.status === 401) { setSessionExpired(true); return; }
      setData(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const investigate = async (query: string) => {
    if (!query.trim()) { setInvestigationData(null); return; }
    setIsSearching(true);
    try {
      let url = `${API_BASE}/admin`;
      if (query.includes('@')) url += `?email=${encodeURIComponent(query)}`;
      else if (query.includes('?id=') || query.includes('player')) {
        const m = query.match(/[?&]id=([^&]+)/);
        url += `?id=${encodeURIComponent(m ? m[1] : query)}`;
      } else url += `?sessionId=${encodeURIComponent(query)}`;

      const res = await fetch(url, { headers: { Authorization: `Bearer ${user?.accessToken}` } });
      if (res.status === 401) { setSessionExpired(true); return; }
      setInvestigationData(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => { if (isAdmin) fetchGlobal(); }, [isAdmin]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    investigate(searchQuery);
  };

  if (!isAdmin) return <Navigate to="/library" replace />;

  if (loading && !data) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '1.5rem', color: '#71717A' }}>
      <div style={{ width: 36, height: 36, border: '3px solid rgba(255,255,255,0.08)', borderTopColor: '#EA580C', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <p>Loading operational health…</p>
    </div>
  );

  if (sessionExpired) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '1.5rem', textAlign: 'center' }}>
      <div style={{ fontSize: '2rem' }}>⏱</div>
      <div>
        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#fff', marginBottom: '0.5rem' }}>Session expired</div>
        <div style={{ fontSize: '0.875rem', color: '#71717A' }}>Google token expired. Sign in again.</div>
      </div>
      <button onClick={() => { clearUser(); navigate('/login'); }} style={btn('primary')}>Sign in again</button>
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#ef4444' }}>Error: {error}</div>
  );

  if (!data) return null;

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'infra', label: 'Infrastructure' },
    { key: 'waitlist', label: 'Waitlist' },
  ] as const;

  // investigation view overrides the tab content
  const showInvestigation = investigationData && ['user', 'video', 'session', 'not_found'].includes(investigationData.type);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', paddingBottom: '5rem' }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 700, color: '#EA580C', marginBottom: '0.3rem' }}>Operational Control</p>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', margin: 0 }}>Admin</h1>
          <p style={{ fontSize: '0.78rem', color: '#52525B', marginTop: '0.25rem' }}>Signed in as {user?.email}</p>
        </div>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Email, player URL, or session ID…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ background: '#0A0A0F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '0.65rem 1rem', color: '#fff', width: 340, fontSize: '0.875rem', outline: 'none' }}
          />
          <button type="submit" disabled={isSearching} style={{ ...btn('primary'), opacity: isSearching ? 0.5 : 1 }}>
            {isSearching ? 'Searching…' : 'Investigate'}
          </button>
          {showInvestigation && (
            <button type="button" onClick={() => { setSearchQuery(''); setInvestigationData(null); }} style={btn('ghost')}>✕ Clear</button>
          )}
        </form>
      </div>

      {/* investigation overlay */}
      {showInvestigation ? (
        investigationData.type === 'not_found'
          ? <div style={{ ...card, textAlign: 'center', padding: '4rem' }}><h2 style={{ color: '#fff' }}>Not found</h2><p style={{ color: '#71717A' }}>{investigationData.message}</p></div>
          : investigationData.type === 'user'
            ? <UserView data={investigationData} onSessionClick={s => { setSearchQuery(s); investigate(s); }} />
            : investigationData.type === 'video'
              ? <VideoView data={investigationData} onSessionClick={s => { setSearchQuery(s); investigate(s); }} />
              : <SessionView data={investigationData} searchQuery={searchQuery} />
      ) : (
        <>
          {/* tabs */}
          <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '0.25rem', width: 'fit-content' }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '0.5rem 1.25rem', borderRadius: '0.55rem', border: 'none', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, transition: 'all 0.15s', background: tab === t.key ? '#18181B' : 'transparent', color: tab === t.key ? '#fff' : '#71717A' }}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'overview' && <OverviewTab data={data} onSessionClick={s => { setSearchQuery(s); investigate(s); }} />}
          {tab === 'infra' && <InfraTab data={data} />}
          {tab === 'waitlist' && <WaitlistTab token={user?.accessToken ?? ''} />}
        </>
      )}
    </div>
  );
}
