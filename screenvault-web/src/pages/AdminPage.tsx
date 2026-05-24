import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { safeFetch } from '../api';
import { getUser } from '../auth';
import { API_BASE } from '../config';

const ADMIN_EMAIL = 'karthik.upadhyay98@gmail.com';

export function AdminPage() {
  const user = getUser();
  const isAdmin = user?.email === ADMIN_EMAIL;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const fetchAdminData = async (query?: string) => {
    try {
      if (query) setIsSearching(true);
      else setLoading(true);

      let url = `${API_BASE}/admin`;

      if (query) {
        if (query.includes('@')) {
          url += `?email=${encodeURIComponent(query)}`;
        } else if (query.includes('player') || query.includes('?id=')) {
          const match = query.match(/[?&]id=([^&]+)/);
          const id = match ? match[1] : query;
          url += `?id=${encodeURIComponent(id)}`;
        } else {
          url += `?sessionId=${encodeURIComponent(query)}`;
        }
      }

      const res = await safeFetch(url);
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    fetchAdminData();
  }, [isAdmin]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) fetchAdminData();
    else fetchAdminData(searchQuery);
  };

  if (!isAdmin) return <Navigate to="/library" replace />;

  if (loading && !data) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#A1A1AA', gap: '1.5rem' }}>
      <div style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <p style={{ fontWeight: 500 }}>Loading operational health...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#ef4444' }}>
      Error: {error}
    </div>
  );

  if (!data) return null;

  const renderEventTable = (events: any[]) => {
    const grouped = (events || []).reduce((acc: any[], ev: any) => {
      const last = acc[acc.length - 1];
      if (last && last.type === ev.type && last.sessionId === ev.sessionId) {
        last.count = (last.count || 1) + 1;
      } else {
        acc.push({ ...ev, count: 1 });
      }
      return acc;
    }, []);

    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.01)' }}>
              {['Time', 'Event', 'Session', 'Metadata'].map(h => (
                <th key={h} style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: '#71717A', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map((ev: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '1rem 1.5rem', color: '#71717A', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{new Date(ev.createdAt).toLocaleString()}</td>
                <td style={{ padding: '1rem 1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, background: ev.type?.includes('failed') || ev.type?.includes('denied') ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)', color: ev.type?.includes('failed') || ev.type?.includes('denied') ? '#ef4444' : '#fff' }}>{ev.type}</span>
                    {ev.count > 1 && <span style={{ fontSize: '0.7rem', color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>{ev.count}x</span>}
                  </div>
                </td>
                <td style={{ padding: '1rem 1.5rem' }}>
                  <button onClick={() => { setSearchQuery(ev.sessionId); fetchAdminData(ev.sessionId); }} style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                    {ev.sessionId?.slice(0, 8) || 'N/A'}...
                  </button>
                </td>
                <td style={{ padding: '1rem 1.5rem', color: '#71717A', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                  {ev.metadata && ev.metadata !== '{}' ? ev.metadata : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderGlobalStats = () => (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
        {[
          { label: 'Upload Success', value: `${data.upload.successRate}%`, sub: `7d • Deduplicated (${data.upload.success}/${data.upload.success + data.upload.failed})`, status: data.upload.successRate > 90 ? 'healthy' : 'warning' },
          { label: 'Playback Success', value: `${data.playback.successRate}%`, sub: `7d • Deduplicated (${data.playback.started}/${data.playback.started + data.playback.failed})`, status: data.playback.successRate > 90 ? 'healthy' : 'warning' },
          { label: 'Active Users', value: data.activeUsers, sub: '24h • High Confidence', status: 'neutral' },
          { label: 'Total Library', value: data.totalVideos, sub: 'Lifetime • Absolute', status: 'neutral' },
        ].map((stat, i) => (
          <div key={i} style={{ padding: '1.5rem', borderRadius: '1.25rem', background: '#0A0A0F', border: '1px solid rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '4px', background: stat.status === 'healthy' ? '#10b981' : stat.status === 'warning' ? '#f59e0b' : 'transparent' }} />
            <div style={{ fontSize: '0.875rem', color: '#71717A', fontWeight: 500, marginBottom: '0.5rem' }}>{stat.label}</div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#fff', marginBottom: '0.25rem' }}>{stat.value}</div>
            <div style={{ fontSize: '0.75rem', color: '#3F3F46' }}>{stat.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '3rem' }}>
        {[
          { title: 'Top Upload Failures', errors: data.upload.topErrors },
          { title: 'Top Playback Failures', errors: data.playback.topErrors },
        ].map(({ title, errors }) => (
          <div key={title} style={{ background: '#0A0A0F', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1.25rem', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', marginBottom: '0.25rem' }}>{title}</h3>
            <p style={{ fontSize: '0.75rem', color: '#71717A', marginBottom: '1.5rem' }}>Last 7 Days • Unique Sessions</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {errors.map((err: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.875rem', color: '#A1A1AA', fontFamily: 'monospace' }}>{err.error || 'Generic Error'}</span>
                  <span style={{ fontSize: '0.875rem', color: '#ef4444', fontWeight: 600 }}>{err.count}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {data.recentEvents?.length > 0 && (
        <div style={{ background: '#0A0A0F', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1.5rem', overflow: 'hidden' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#fff' }}>Recent System Events</h2>
          </div>
          {renderEventTable(data.recentEvents)}
        </div>
      )}
    </>
  );

  const renderUserInvestigation = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '2rem', marginBottom: '3rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ background: '#0A0A0F', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1.5rem', padding: '2rem', textAlign: 'center' }}>
          <img src={data.user.picture} alt="" style={{ width: '80px', height: '80px', borderRadius: '50%', marginBottom: '1rem', border: '2px solid #3b82f6' }} />
          <h2 style={{ fontSize: '1.25rem', color: '#fff', marginBottom: '0.25rem' }}>{data.user.name}</h2>
          <p style={{ fontSize: '0.875rem', color: '#71717A', marginBottom: '1.5rem' }}>{data.user.email}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', textAlign: 'left' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '0.75rem' }}>
              <div style={{ fontSize: '0.65rem', color: '#71717A', textTransform: 'uppercase' }}>Uploads</div>
              <div style={{ fontSize: '1.125rem', color: '#fff', fontWeight: 600 }}>{data.stats.uploads}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '0.75rem' }}>
              <div style={{ fontSize: '0.65rem', color: '#71717A', textTransform: 'uppercase' }}>Fails</div>
              <div style={{ fontSize: '1.125rem', color: '#ef4444', fontWeight: 600 }}>{data.stats.failures}</div>
            </div>
          </div>
        </div>
        <div style={{ background: '#0A0A0F', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1.5rem', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#fff', marginBottom: '1rem' }}>Linked Storage Accounts</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {data.linkedAccounts.map((acc: any, i: number) => (
              <div key={i} style={{ fontSize: '0.875rem', color: '#A1A1AA', padding: '0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.5rem' }}>{acc.email}</div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ background: '#0A0A0F', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1.5rem', overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fff' }}>Recent User Events</h3>
        </div>
        {renderEventTable(data.recentEvents)}
      </div>
    </div>
  );

  const renderVideoInvestigation = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginBottom: '3rem' }}>
      <div style={{ background: '#0A0A0F', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1.5rem', padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
          <div>
            <p style={{ fontSize: '0.75rem', color: '#3b82f6', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Video Investigation</p>
            <h2 style={{ fontSize: '1.5rem', color: '#fff', fontWeight: 700 }}>{data.video.title}</h2>
            <p style={{ fontSize: '0.875rem', color: '#71717A' }}>ID: {data.video.id}</p>
          </div>
          <span style={{ padding: '0.5rem 1rem', borderRadius: '2rem', background: data.video.status === 'ready' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: data.video.status === 'ready' ? '#10b981' : '#f59e0b', fontSize: '0.75rem', fontWeight: 600 }}>
            {data.video.status?.toUpperCase()}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
          {[
            { label: 'Owner Email', value: data.video.accountEmail },
            { label: 'Workspace ID', value: data.video.workspaceId },
            { label: 'Created At', value: new Date(data.video.createdAt).toLocaleString() },
            { label: 'Playback Events', value: data.playbackEvents?.length },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#71717A', marginBottom: '0.25rem' }}>{label}</div>
              <div style={{ color: '#fff', fontSize: '0.875rem', fontWeight: 500 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: '#0A0A0F', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1.5rem', overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fff' }}>Playback Lifecycle</h3>
        </div>
        {renderEventTable(data.playbackEvents)}
      </div>
    </div>
  );

  const renderSessionTrace = () => {
    const grouped = (data.sessionLogs || []).reduce((acc: any[], log: any) => {
      const last = acc[acc.length - 1];
      if (last && last.tag === log.tag && last.source === log.source) {
        last.count = (last.count || 1) + 1;
      } else {
        acc.push({ ...log, count: 1 });
      }
      return acc;
    }, []);

    return (
      <div style={{ background: '#0A0A0F', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1.5rem', overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#fff' }}>Lifecycle Trace: {searchQuery}</h2>
          <span style={{ fontSize: '0.75rem', color: '#71717A', textTransform: 'uppercase' }}>{grouped.length} events ({data.sessionLogs?.length || 0} raw)</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.01)' }}>
                {['Time', 'Tag', 'Source', 'Data'].map(h => (
                  <th key={h} style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: '#71717A', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map((log: any, i: number) => {
                const isError = log.tag?.includes('ERROR') || log.tag?.includes('FAILED');
                const isSuccess = log.tag?.includes('COMPLETE') || log.tag?.includes('SUCCESS');
                return (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: isError ? 'rgba(239,68,68,0.05)' : isSuccess ? 'rgba(16,185,129,0.05)' : 'transparent' }}>
                    <td style={{ padding: '1rem 1.5rem', color: '#71717A', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{new Date(log.timestamp).toLocaleString()}</td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: isError ? '#ef4444' : isSuccess ? '#10b981' : '#fff', fontSize: '0.875rem', fontWeight: 600 }}>{log.tag}</span>
                        {log.count > 1 && <span style={{ fontSize: '0.7rem', color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>{log.count}x RETRIES</span>}
                      </div>
                    </td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: log.source === 'extension' ? 'rgba(59,130,246,0.1)' : 'rgba(139,92,246,0.1)', color: log.source === 'extension' ? '#3b82f6' : '#8b5cf6' }}>{log.source?.toUpperCase()}</span>
                    </td>
                    <td style={{ padding: '1rem 1.5rem', color: '#A1A1AA', fontSize: '0.75rem', fontFamily: 'monospace', maxWidth: '500px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.data}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', paddingBottom: '5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '3rem', flexWrap: 'wrap', gap: '1.5rem' }}>
        <div>
          <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 600, color: '#3b82f6', marginBottom: '0.5rem' }}>Operational Control</p>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>Admin</h1>
        </div>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem' }}>
          <input
            type="text"
            placeholder="Search email, player URL, or session ID..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ background: '#0A0A0F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '0.75rem 1rem', color: '#fff', width: '380px', fontSize: '0.875rem', outline: 'none' }}
          />
          <button type="submit" disabled={isSearching} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '0.75rem', fontWeight: 600, cursor: 'pointer', opacity: isSearching ? 0.5 : 1 }}>
            {isSearching ? 'Searching...' : 'Investigate'}
          </button>
          {data.type !== 'global' && (
            <button type="button" onClick={() => { setSearchQuery(''); fetchAdminData(); }} style={{ background: 'transparent', color: '#71717A', border: '1px solid rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '0.75rem', cursor: 'pointer' }}>
              Clear
            </button>
          )}
        </form>
      </div>

      {data.type === 'global' && renderGlobalStats()}
      {data.type === 'user' && renderUserInvestigation()}
      {data.type === 'video' && renderVideoInvestigation()}
      {data.type === 'session' && renderSessionTrace()}
      {data.type === 'not_found' && (
        <div style={{ padding: '4rem', textAlign: 'center', background: '#0A0A0F', borderRadius: '1.5rem', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 style={{ color: '#fff', fontSize: '1.5rem', marginBottom: '0.5rem' }}>Not Found</h2>
          <p style={{ color: '#71717A' }}>{data.message}</p>
        </div>
      )}
    </div>
  );
}
