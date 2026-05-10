import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { safeFetch } from '../../utils/api';

export function AdminPage({ session }: { session: any }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const isAdmin = session?.user?.email === 'karthik.upadhyay98@gmail.com';

  const fetchAdminData = async (query?: string) => {
    try {
      if (query) setIsSearching(true);
      else setLoading(true);

      let url = `https://screenvault-backend.karthik-upadhyay98.workers.dev/admin`;
      
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

  if (!isAdmin && session?.user?.email !== 'Loading...') {
    return <Navigate to="/library" replace />;
  }

  if (loading && !data) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#A1A1AA', gap: '1.5rem' }}>
      <div style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
      <p style={{ fontWeight: 500 }}>Loading operational health...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

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
        <div style={{ background: '#0A0A0F', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1.25rem', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', marginBottom: '0.25rem' }}>Top Upload Failures</h3>
          <p style={{ fontSize: '0.75rem', color: '#71717A', marginBottom: '1.5rem' }}>Last 7 Days • Unique Sessions</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {data.upload.topErrors.map((err: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', color: '#A1A1AA', fontFamily: 'monospace' }}>{err.error || 'Generic Error'}</span>
                <span style={{ fontSize: '0.875rem', color: '#ef4444', fontWeight: 600 }}>{err.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: '#0A0A0F', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1.25rem', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#fff', marginBottom: '0.25rem' }}>Top Playback Failures</h3>
          <p style={{ fontSize: '0.75rem', color: '#71717A', marginBottom: '1.5rem' }}>Last 7 Days • Unique Sessions</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {data.playback.topErrors.map((err: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', color: '#A1A1AA' }}>{err.error || 'Unknown'}</span>
                <span style={{ fontSize: '0.875rem', color: '#ef4444', fontWeight: 600 }}>{err.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );

  const renderUserInvestigation = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '2rem', marginBottom: '3rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ background: '#0A0A0F', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1.5rem', padding: '2rem', textAlign: 'center' }}>
          <img src={data.user.picture} style={{ width: '80px', height: '80px', borderRadius: '50%', marginBottom: '1rem', border: '2px solid #3b82f6' }} />
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
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem', marginBottom: '3rem' }}>
       <div style={{ background: '#0A0A0F', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1.5rem', padding: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
            <div>
              <p style={{ fontSize: '0.75rem', color: '#3b82f6', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Video Investigation</p>
              <h2 style={{ fontSize: '1.5rem', color: '#fff', fontWeight: 700 }}>{data.video.title}</h2>
              <p style={{ fontSize: '0.875rem', color: '#71717A' }}>ID: {data.video.id}</p>
            </div>
            <div style={{ padding: '0.5rem 1rem', borderRadius: '2rem', background: data.video.status === 'ready' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: data.video.status === 'ready' ? '#10b981' : '#f59e0b', fontSize: '0.75rem', fontWeight: 600 }}>
              {data.video.status.toUpperCase()}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '1rem' }}>
               <div style={{ fontSize: '0.75rem', color: '#71717A', marginBottom: '0.25rem' }}>Owner Email</div>
               <div style={{ color: '#fff', fontSize: '0.875rem', fontWeight: 500 }}>{data.video.accountEmail}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '1rem' }}>
               <div style={{ fontSize: '0.75rem', color: '#71717A', marginBottom: '0.25rem' }}>Workspace ID</div>
               <div style={{ color: '#fff', fontSize: '0.875rem', fontWeight: 500 }}>{data.video.workspaceId}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '1rem' }}>
               <div style={{ fontSize: '0.75rem', color: '#71717A', marginBottom: '0.25rem' }}>Created At</div>
               <div style={{ color: '#fff', fontSize: '0.875rem', fontWeight: 500 }}>{new Date(data.video.createdAt).toLocaleString()}</div>
            </div>
             <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '1rem' }}>
               <div style={{ fontSize: '0.75rem', color: '#71717A', marginBottom: '0.25rem' }}>Total Playback Events</div>
               <div style={{ color: '#fff', fontSize: '0.875rem', fontWeight: 500 }}>{data.playbackEvents.length}</div>
            </div>
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

  const renderEventTable = (events: any[]) => {
    const groupedEvents = (events || []).reduce((acc: any[], event: any) => {
      const lastEvent = acc[acc.length - 1];
      if (lastEvent && lastEvent.type === event.type && lastEvent.sessionId === event.sessionId) {
        lastEvent.count = (lastEvent.count || 1) + 1;
      } else {
        acc.push({ ...event, count: 1 });
      }
      return acc;
    }, []);

    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.01)' }}>
              <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: '#71717A', textTransform: 'uppercase' }}>Time</th>
              <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: '#71717A', textTransform: 'uppercase' }}>Event</th>
              <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: '#71717A', textTransform: 'uppercase' }}>Session</th>
              <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: '#71717A', textTransform: 'uppercase' }}>Metadata</th>
            </tr>
          </thead>
          <tbody>
            {groupedEvents.map((event: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '1rem 1.5rem', color: '#71717A', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{new Date(event.createdAt).toLocaleString()}</td>
                <td style={{ padding: '1rem 1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ 
                      padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600,
                      background: event.type.includes('failed') || event.type.includes('denied') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.05)',
                      color: event.type.includes('failed') || event.type.includes('denied') ? '#ef4444' : '#fff'
                    }}>{event.type}</span>
                    {event.count > 1 && (
                      <span style={{ fontSize: '0.7rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                        {event.count}x
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '1rem 1.5rem' }}>
                  <button onClick={() => { setSearchQuery(event.sessionId); fetchAdminData(event.sessionId); }} style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                    {event.sessionId?.slice(0, 8) || 'N/A'}...
                  </button>
                </td>
                <td style={{ padding: '1rem 1.5rem', color: '#71717A', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                  {event.metadata && event.metadata !== '{}' ? event.metadata : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderSessionTrace = () => {
    // Group consecutive noisy events (retries, same tags)
    const groupedLogs = (data.sessionLogs || []).reduce((acc: any[], log: any) => {
      const lastLog = acc[acc.length - 1];
      if (lastLog && lastLog.tag === log.tag && lastLog.source === log.source) {
        lastLog.count = (lastLog.count || 1) + 1;
      } else {
        acc.push({ ...log, count: 1 });
      }
      return acc;
    }, []);

    return (
      <div style={{ background: '#0A0A0F', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1.5rem', overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#fff' }}>Lifecycle Trace: {searchQuery}</h2>
          <span style={{ fontSize: '0.75rem', color: '#71717A', textTransform: 'uppercase' }}>{groupedLogs.length} operational events ({data.sessionLogs?.length || 0} raw logs)</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.01)' }}>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: '#71717A', textTransform: 'uppercase' }}>Time</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: '#71717A', textTransform: 'uppercase' }}>Tag</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: '#71717A', textTransform: 'uppercase' }}>Source</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', color: '#71717A', textTransform: 'uppercase' }}>Data</th>
              </tr>
            </thead>
            <tbody>
              {groupedLogs.map((log: any, i: number) => {
                const isError = log.tag.includes('ERROR') || log.tag.includes('FAILED');
                const isSuccess = log.tag.includes('COMPLETE') || log.tag.includes('SUCCESS');
                const tagColor = isError ? '#ef4444' : isSuccess ? '#10b981' : '#fff';
                const bgColor = isError ? 'rgba(239, 68, 68, 0.05)' : isSuccess ? 'rgba(16, 185, 129, 0.05)' : 'transparent';
                
                return (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: bgColor }}>
                    <td style={{ padding: '1rem 1.5rem', color: '#71717A', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{new Date(log.timestamp).toLocaleString()}</td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: tagColor, fontSize: '0.875rem', fontWeight: 600 }}>{log.tag}</span>
                        {log.count > 1 && (
                          <span style={{ fontSize: '0.7rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                            {log.count}x RETRIES
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: log.source === 'extension' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(139, 92, 246, 0.1)', color: log.source === 'extension' ? '#3b82f6' : '#8b5cf6' }}>{log.source.toUpperCase()}</span>
                    </td>
                    <td style={{ padding: '1rem 1.5rem' }}>
                      <div style={{ fontSize: '0.75rem', color: '#A1A1AA', fontFamily: 'monospace', maxWidth: '500px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.data}</div>
                    </td>
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
          <h1 style={{ fontSize: '2.5rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>Admin Support</h1>
        </div>
        
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem' }}>
          <input 
            type="text" 
            placeholder="Search Email, Player URL, or Session ID..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ background: '#0A0A0F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', padding: '0.75rem 1rem', color: '#fff', width: '400px', fontSize: '0.875rem' }}
          />
          <button type="submit" disabled={isSearching} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '0.75rem', fontWeight: 600, cursor: 'pointer', opacity: isSearching ? 0.5 : 1 }}>
            {isSearching ? 'Searching...' : 'Investigate'}
          </button>
          {data.type !== 'global' ? (
            <button type="button" onClick={() => { setSearchQuery(""); fetchAdminData(); }} style={{ background: 'transparent', color: '#71717A', border: '1px solid rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '0.75rem', cursor: 'pointer' }}>
              Clear
            </button>
          ) : null}
        </form>
      </div>

      {data.type === 'global' && renderGlobalStats()}
      {data.type === 'user' && renderUserInvestigation()}
      {data.type === 'video' && renderVideoInvestigation()}
      {data.type === 'session' && renderSessionTrace()}
      {data.type === 'not_found' && (
        <div style={{ padding: '4rem', textAlign: 'center', background: '#0A0A0F', borderRadius: '1.5rem', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 style={{ color: '#fff', fontSize: '1.5rem', marginBottom: '0.5rem' }}>Investigation Failed</h2>
          <p style={{ color: '#71717A' }}>{data.message}</p>
        </div>
      )}
      
      {!data.sessionLogs?.length && data.type !== 'user' && data.type !== 'video' && data.type !== 'not_found' && (
        <div style={{ background: '#0A0A0F', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1.5rem', overflow: 'hidden' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#fff' }}>Recent System Events</h2>
          </div>
          {renderEventTable(data.recentEvents)}
        </div>
      )}
    </div>
  );
}

