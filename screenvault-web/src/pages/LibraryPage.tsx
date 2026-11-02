import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getUser } from '../auth';
import { safeFetch } from '../api';
import { API_BASE, VIEWER_BASE, DASHBOARD_BASE, STREAM_BASE } from '../config';
import { uploadLocalFile, validateUpload, resolveContentType, ACCEPTED_UPLOAD_TYPES } from '../upload';
import { BackendVideo, Folder, WorkspaceMember, WorkspaceVideo } from '../types';

const getDeterministicColor = (email: string) => {
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

// The player URL already carries the encrypted stream id as ?id= — reuse
// it to hit the streaming worker directly for the hover preview, no
// separate preview clip/upload needed.
// Resting preview frame is grabbed a couple seconds in (avoids the often-blank
// first frame); hovering resumes playback from there for a short loop.
const PREVIEW_START = 2.5;
const PREVIEW_LOOP_SECONDS = 4;

const extractStreamId = (playerUrl?: string | null) => {
  if (!playerUrl) return null;
  try {
    return new URL(playerUrl).searchParams.get('id');
  } catch {
    return null;
  }
};

export function LibraryPage() {
  const [files, setFiles] = useState<WorkspaceVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [nextCursor, setNextCursor] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [invites, setInvites] = useState<any[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [workspacesList, setWorkspacesList] = useState<{ id: string; name: string }[]>([]);
  const [moveFolderTarget, setMoveFolderTarget] = useState<WorkspaceVideo | null>(null);
  const [moveWorkspaceTarget, setMoveWorkspaceTarget] = useState<WorkspaceVideo | null>(null);

  const [uploads, setUploads] = useState<{ id: string; name: string; progress: number; error?: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | 'video' | 'image' | 'audio'>('all');
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'mine'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name-asc' | 'name-desc'>('newest');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const isFetching = useRef(false);
  const observerTarget = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const user = getUser();
  const [searchParams] = useSearchParams();
  const activeFolderId = searchParams.get('folder');

  const fetchData = useCallback(async (cursor?: any) => {
    const isInitial = !cursor;
    if (isFetching.current && !isInitial) return;
    isFetching.current = true;

    if (isInitial) { setLoading(true); setFiles([]); setNextCursor(null); setHasMore(false); }
    else setLoadingMore(true);
    setError(null);

    if (!user?.workspaceId) {
      setLoading(false);
      isFetching.current = false;
      return;
    }

    try {
      let url = `${API_BASE}/videos?workspaceId=${user.workspaceId}&limit=12`;
      if (activeFolderId) url += `&folderId=${activeFolderId}`;
      if (cursor) url += `&cursor=${cursor}`;
      const res = await safeFetch(url);
      const { videos, nextCursor: newCursor, hasMore: moreAvailable } = await res.json();

      setNextCursor(newCursor);
      setHasMore(moreAvailable);

      const mapped: WorkspaceVideo[] = (videos || []).map((v: BackendVideo) => ({
        id: v.id,
        backendId: v.id,
        fileId: v.fileId,
        title: v.title || 'Recording',
        name: (v.title || 'Recording') + '.webm',
        createdTime: new Date(v.createdAt || Date.now()).toISOString(),
        createdAt: v.createdAt,
        thumbnailLink: v.thumbnailUrl || null,
        previewUrl: v.previewUrl,
        playerUrl: v.playerUrl,
        accountEmail: v.accountEmail || v.account_email || 'External',
        status: v.status || 'ready',
        ownerId: v.ownerId,
        workspaceId: v.workspaceId,
        folderId: v.folderId,
        mediaType: v.mediaType,
      }));

      if (isInitial) setFiles(mapped);
      else setFiles(prev => [...prev, ...mapped]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      isFetching.current = false;
    }
  }, [user?.workspaceId, activeFolderId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!hasMore || loadingMore || loading) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) fetchData(nextCursor);
    }, { threshold: 0.1 });
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, nextCursor, fetchData]);

  const fetchMembers = useCallback(async () => {
    if (!user?.workspaceId) return;
    setLoadingMembers(true);
    try {
      const res = await safeFetch(`${API_BASE}/workspace/members?workspaceId=${user.workspaceId}`);
      setMembers(await res.json());
    } catch { } finally { setLoadingMembers(false); }
  }, [user?.workspaceId]);

  const fetchInvites = useCallback(async () => {
    if (!user?.workspaceId) return;
    setLoadingInvites(true);
    try {
      const res = await safeFetch(`${API_BASE}/workspace/invites?workspaceId=${user.workspaceId}`);
      setInvites(await res.json());
    } catch { } finally { setLoadingInvites(false); }
  }, [user?.workspaceId]);

  useEffect(() => {
    if (showMembersModal) { fetchMembers(); fetchInvites(); }
  }, [showMembersModal, fetchMembers, fetchInvites]);

  const fetchFolders = useCallback(async () => {
    if (!user?.workspaceId) return;
    try {
      const res = await safeFetch(`${API_BASE}/folders?workspaceId=${user.workspaceId}`);
      const data = await res.json();
      setFolders(data.folders || []);
    } catch { }
  }, [user?.workspaceId]);

  useEffect(() => { fetchFolders(); }, [fetchFolders]);

  useEffect(() => {
    safeFetch(`${API_BASE}/workspaces`)
      .then(r => r.json())
      .then(data => setWorkspacesList(data.workspaces || []))
      .catch(() => { });
  }, [user?.workspaceId]);

  const handleFilesSelected = async (list: FileList | null) => {
    if (!list?.length || !user?.workspaceId) return;
    // Folder picks include junk (.DS_Store, docs, ...): skip unsupported files quietly.
    const picked = Array.from(list).filter(f => !(f as any).webkitRelativePath || resolveContentType(f));
    if (!picked.length) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    const items = picked.map(file => ({ file, id: crypto.randomUUID(), error: validateUpload(file) }));
    // Folder picks carry webkitRelativePath ("Trip/day1/a.mp4"): mirror the top-level
    // folder in the library (reusing one with the same name) and file into it.
    const folderIdByName = new Map<string, string>();
    const resolveFolder = async (file: File): Promise<string | null> => {
      const top = (file as any).webkitRelativePath?.split('/')[0];
      if (!top || (file as any).webkitRelativePath.split('/').length < 2) return activeFolderId;
      if (folderIdByName.has(top)) return folderIdByName.get(top)!;
      let id = folders.find(f => f.name === top)?.id;
      if (!id) {
        const res = await safeFetch(`${API_BASE}/folders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId: user.workspaceId, name: top }),
        });
        id = (await res.json()).id as string;
        fetchFolders();
      }
      folderIdByName.set(top, id);
      return id;
    };
    setUploads(prev => [...prev, ...items.map(i => ({ id: i.id, name: i.file.name, progress: 0, error: i.error || undefined }))]);
    const patch = (id: string, change: Partial<{ progress: number; error: string }>) =>
      setUploads(prev => prev.map(u => (u.id === id ? { ...u, ...change } : u)));

    // Sequential: the backend is happier with one multipart upload at a time per user.
    for (const { file, id, error } of items) {
      if (error) continue;
      try {
        await uploadLocalFile(file, {
          workspaceId: user.workspaceId,
          accountEmail: user.email,
          folderId: await resolveFolder(file),
          onProgress: progress => patch(id, { progress }),
        });
        fetchData();
        setTimeout(() => setUploads(prev => prev.filter(u => u.id !== id)), 3000);
      } catch (e: any) {
        patch(id, { error: e.message || 'Upload failed' });
      }
    }
  };

  const handleMoveToFolder = async (file: WorkspaceVideo, folderId: string | null) => {
    try {
      await safeFetch(`${API_BASE}/videos/${file.backendId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId }),
      });
      setMoveFolderTarget(null);
      fetchData();
    } catch (err: any) {
      alert(`Failed to move recording: ${err.message}`);
    }
  };

  const handleMoveToWorkspace = async (file: WorkspaceVideo, workspaceId: string) => {
    try {
      await safeFetch(`${API_BASE}/videos/${file.backendId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      setMoveWorkspaceTarget(null);
      fetchData();
    } catch (err: any) {
      alert(`Failed to move recording: ${err.message}`);
    }
  };

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        document.getElementById('search-input')?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const filteredFiles = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    let list = files.filter(f =>
      (!q || (f.title || '').toLowerCase().includes(q)) &&
      (typeFilter === 'all' || (f.mediaType === 'image' ? 'image' : f.mediaType === 'audio' ? 'audio' : 'video') === typeFilter) &&
      (ownerFilter === 'all' || f.ownerId === user?.userId)
    );
    if (sortBy !== 'newest') {
      list = [...list].sort((a, b) => {
        switch (sortBy) {
          case 'oldest': return (a.createdAt || 0) - (b.createdAt || 0);
          case 'name-asc': return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base', numeric: true });
          case 'name-desc': return (b.title || '').localeCompare(a.title || '', undefined, { sensitivity: 'base', numeric: true });
        }
        return 0;
      });
    }
    return list;
  }, [files, debouncedQuery, typeFilter, ownerFilter, sortBy, user?.userId]);
  const filtersActive = typeFilter !== 'all' || ownerFilter !== 'all' || sortBy !== 'newest';

  const openVideo = (video: WorkspaceVideo) => {
    if (video.playerUrl) { window.open(video.playerUrl, '_blank'); return; }
    if (video.fileId) {
      window.open(`${VIEWER_BASE}/?id=${video.fileId}&title=${encodeURIComponent(video.title)}`, '_blank');
    }
  };

  const copyLink = async (e: React.MouseEvent, video: WorkspaceVideo) => {
    e.stopPropagation();
    if (!video.playerUrl) return;
    await navigator.clipboard.writeText(video.playerUrl);
    setCopiedId(video.id);
    setTimeout(() => setCopiedId(null), 1000);
  };

  const handleRename = async (file: WorkspaceVideo) => {
    const newTitle = editingTitle.trim();
    if (!newTitle || newTitle === file.title) { setEditingId(null); return; }
    setFiles(prev => prev.map(f => f.id === file.id ? { ...f, title: newTitle } : f));
    setEditingId(null);
    try {
      await safeFetch(`${API_BASE}/videos/${file.backendId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
    } catch { }
  };

  // Owner-only: the backend re-checks ownership and returns a short-lived signed
  // link, so the browser streams the original file straight to disk.
  const handleDownload = async (file: WorkspaceVideo) => {
    try {
      const res = await safeFetch(`${API_BASE}/videos/${file.backendId}/download-link`, { method: 'POST' });
      const { url } = await res.json();
      const a = document.createElement('a');
      a.href = url;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e: any) {
      alert(e.message || 'Download failed');
    }
  };

  const handleDelete = async (file: WorkspaceVideo) => {
    if (deletingId === file.id) return;
    if (!confirm(`Delete "${file.title}"? This cannot be undone.`)) return;
    setFiles(prev => prev.filter(f => f.id !== file.id));
    setDeletingId(file.id);
    try {
      await safeFetch(`${API_BASE}/videos/${file.backendId}`, { method: 'DELETE' });
    } catch { } finally { setDeletingId(null); }
  };

  const handleInvite = async () => {
    if (inviting || !user?.workspaceId) return;
    setInviting(true);
    try {
      const res = await safeFetch(`${API_BASE}/workspace/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: user.workspaceId }),
      });
      const data = await res.json();
      const fullUrl = data.joinUrl || `${DASHBOARD_BASE}/invite/${data.token}`;
      setInviteUrl(fullUrl);
      await navigator.clipboard.writeText(fullUrl);
      fetchInvites();
      setTimeout(() => setInviteUrl(null), 1000);
    } catch (err: any) {
      alert(`Invite failed: ${err.message}`);
    } finally { setInviting(false); }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!confirm('Revoke this invite?')) return;
    try {
      await safeFetch(`${API_BASE}/workspace/invite/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId }),
      });
      fetchInvites();
    } catch (err: any) { alert(`Failed: ${err.message}`); }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Remove this member?')) return;
    try {
      await safeFetch(`${API_BASE}/workspace/member/${userId}?workspaceId=${user?.workspaceId}`, { method: 'DELETE' });
      fetchMembers();
    } catch (err: any) { alert(`Failed: ${err.message}`); }
  };

  const handleLeaveWorkspace = async () => {
    if (leaving || !user?.workspaceId) return;
    setLeaving(true);
    try {
      await safeFetch(`${API_BASE}/workspace/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: user.workspaceId }),
      });
      window.location.reload();
    } catch (err: any) { alert(`Failed: ${err.message}`); } finally { setLeaving(false); }
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${safe})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase()
        ? <mark key={i} style={{ backgroundColor: '#fde68a', color: '#000', borderRadius: '2px', padding: '0 2px' }}>{part}</mark>
        : part
    );
  };

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#D4D4D8', gap: '1.5rem' }}>
      <div style={{ width: '48px', height: '48px', borderRadius: 14, background: '#EA580C', animation: 'sv-pulse-in 500ms cubic-bezier(0.16,1,0.3,1) both, sv-pulse-ring 1.8s ease-out 500ms infinite' }} />
      <style>{`
        @keyframes sv-pulse-in {
          0% { opacity: 0; transform: scale(0.6); }
          50% { opacity: 1; transform: scale(1.08); }
          70% { transform: scale(0.97); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes sv-pulse-ring {
          0%, 100% { box-shadow: 0 0 0 0 rgba(234,88,12,0.5); }
          50% { box-shadow: 0 0 0 14px rgba(234,88,12,0); }
        }
      `}</style>
      <p style={{ fontWeight: 500 }}>Loading workspace library...</p>
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#fff', textAlign: 'center', padding: '2rem' }}>
      <div style={{ background: 'rgba(239,68,68,0.1)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid rgba(239,68,68,0.2)', marginBottom: '1.5rem' }}>
        <p style={{ color: '#ef4444', fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.5rem' }}>Connection Error</p>
        <p style={{ color: '#D4D4D8', fontSize: '0.9rem', maxWidth: '300px' }}>{error}</p>
      </div>
      <button onClick={() => fetchData()} style={{ background: '#EA580C', color: '#fff', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '9999px', fontWeight: 600, cursor: 'pointer' }}>
        Try Again
      </button>
    </div>
  );

  const uploadCard = (
    <button
      type="button"
      className={`sv-upload-card${dragOver ? ' drag' : ''}`}
      onClick={() => fileInputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); handleFilesSelected(e.dataTransfer.files); }}
    >
      <span className="sv-upload-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      </span>
      <span style={{ fontWeight: 600, fontSize: '1rem' }}>Upload files</span>
      <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Click or drop videos, audio and images<br />MP4, MOV, WebM, MP3, WAV, PNG, JPG · up to 2GB</span>
    </button>
  );

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <style>{`
        @keyframes shimmer { 0% { background-position: -800px 0; } 100% { background-position: 800px 0; } }
        .sv-upload-card { background: rgba(255,255,255,0.02); border: 2px dashed rgba(255,255,255,0.12); border-radius: 16px; min-height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem; cursor: pointer; color: #71717a; text-align: center; padding: 1.5rem; font: inherit; transition: background 0.2s, border-color 0.2s, color 0.2s, transform 0.2s cubic-bezier(0.16,1,0.3,1); }
        .sv-upload-card .sv-upload-icon { width: 56px; height: 56px; border-radius: 50%; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; transition: background 0.2s, transform 0.2s; }
        .sv-upload-card:hover, .sv-upload-card.drag { background: rgba(234,88,12,0.08); border-color: #EA580C; color: #EA580C; transform: translateY(-3px); }
        .sv-upload-card:hover .sv-upload-icon, .sv-upload-card.drag .sv-upload-icon { background: rgba(234,88,12,0.18); transform: scale(1.08); }
        .skeleton { background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%); background-size: 800px 100%; animation: shimmer 1.4s infinite linear; border-radius: 8px; }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '3rem' }}>
        <div>
          <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 600, color: '#D4D4D8', marginBottom: '0.5rem' }}>Library</p>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>Team Workspace Library</h1>
          <p style={{ color: '#D4D4D8', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            {activeFolderId
              ? `Library / ${folders.find(f => f.id === activeFolderId)?.name || 'Folder'}`
              : 'All recordings in this workspace are shared with your team.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_UPLOAD_TYPES.join(',')} style={{ display: 'none' }} onChange={e => handleFilesSelected(e.target.files)} />
          <input ref={folderInputRef} type="file" multiple {...({ webkitdirectory: '' } as any)} style={{ display: 'none' }} onChange={e => { handleFilesSelected(e.target.files); e.target.value = ''; }} />
          <button onClick={() => folderInputRef.current?.click()} style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '0.6rem 1.2rem', borderRadius: '9999px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>Upload folder</button>
          <button onClick={() => { setShowMembersModal(true); fetchMembers(); }} style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '0.6rem 1.2rem', borderRadius: '9999px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Members
          </button>
          <button onClick={handleInvite} disabled={inviting} style={{ background: inviteUrl ? '#10B981' : 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', padding: '0.6rem 1.2rem', borderRadius: '9999px', fontWeight: 600, fontSize: '0.85rem', cursor: inviting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: inviting ? 0.6 : 1 }}>
            {inviteUrl ? '✓ Copied Invite Link!' : (inviting ? 'Generating...' : '+ Invite Team Member')}
          </button>
          {user?.workspaceRole === 'member' && (
            <button onClick={() => setShowLeaveConfirm(true)} style={{ background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', padding: '0.6rem 1.2rem', borderRadius: '9999px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
              Leave Workspace
            </button>
          )}
        </div>
      </div>

      {/* Upload progress */}
      {uploads.length > 0 && (
        <div style={{ position: 'fixed', right: '1.5rem', bottom: '1.5rem', zIndex: 70, width: '320px', maxWidth: 'calc(100vw - 3rem)', background: '#18181b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', padding: '0.9rem 1rem', boxShadow: '0 20px 40px -12px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {uploads.map(u => (
            <div key={u.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '0.8rem', color: '#fff', marginBottom: '6px' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                {u.error
                  ? <button onClick={() => setUploads(prev => prev.filter(x => x.id !== u.id))} style={{ background: 'none', border: 'none', color: '#8b8b93', cursor: 'pointer' }}>✕</button>
                  : <span style={{ color: u.progress === 100 ? '#10B981' : '#D4D4D8', flexShrink: 0 }}>{u.progress === 100 ? 'Done' : `${u.progress}%`}</span>}
              </div>
              {u.error
                ? <div style={{ fontSize: '0.75rem', color: '#ef4444' }}>{u.error}</div>
                : <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}><div style={{ width: `${u.progress}%`, height: '100%', background: u.progress === 100 ? '#10B981' : '#EA580C', transition: 'width 0.3s' }} /></div>}
            </div>
          ))}
        </div>
      )}

      {/* Members Modal */}
      {showMembersModal && (
        <div className="sv-modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
          <div className="sv-modal-panel" style={{ background: '#18181b', padding: '2rem', borderRadius: '1.5rem', maxWidth: '500px', width: '90%', border: '1px solid rgba(255,255,255,0.1)', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
            <button onClick={() => setShowMembersModal(false)} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'none', border: 'none', color: '#D4D4D8', cursor: 'pointer' }}>✕</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
              <div>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff' }}>Workspace Settings</h3>
                <p style={{ color: '#D4D4D8', fontSize: '0.9rem', marginTop: '4px' }}>Manage your team and invites</p>
              </div>
              <button onClick={handleInvite} disabled={inviting} style={{ background: '#EA580C', color: '#fff', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '9999px', fontWeight: 600, cursor: inviting ? 'not-allowed' : 'pointer' }}>
                {inviting ? 'Generating...' : 'Generate Invite'}
              </button>
            </div>
            {loadingMembers ? <div style={{ padding: '2rem', textAlign: 'center', color: '#D4D4D8' }}>Loading members...</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '40vh', overflowY: 'auto' }}>
                {members.map(member => (
                  <div key={member.userId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.05)', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(234,88,12,0.15)', border: '1px solid rgba(234,88,12,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 700, color: '#EA580C', flexShrink: 0 }}>
                        {(member.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: '#fff', fontWeight: 500, fontSize: '0.875rem', wordBreak: 'break-all' }}>{member.email}</div>
                        <div style={{ display: 'flex', gap: '4px', marginTop: '3px' }}>
                          {member.userId === user?.userId && <span style={{ fontSize: '0.65rem', color: '#EA580C', background: 'rgba(234,88,12,0.1)', padding: '1px 6px', borderRadius: '4px' }}>You</span>}
                          {member.role === 'owner' && <span style={{ fontSize: '0.65rem', color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '1px 6px', borderRadius: '4px' }}>Owner</span>}
                        </div>
                      </div>
                    </div>
                    {user?.workspaceRole === 'owner' && member.userId !== user?.userId && (
                      <button onClick={() => handleRemoveMember(member.userId)} style={{ color: '#ef4444', background: 'none', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>Remove</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* Active Invites */}
            <div style={{ marginTop: '2rem' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#D4D4D8', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Invites</h4>
              {loadingInvites ? <div style={{ color: '#D4D4D8', fontSize: '0.85rem' }}>Loading...</div> : invites.length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '1rem', color: '#D4D4D8', fontSize: '0.85rem', border: '1px dashed rgba(255,255,255,0.1)' }}>No active invites</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {invites.map(inv => {
                    const isExpired = inv.expiresAt && inv.expiresAt < Date.now();
                    const isRevoked = !!inv.revokedAt;
                    const isActive = !isExpired && !isRevoked;
                    return (
                      <div key={inv.id} style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: isActive ? 1 : 0.6 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', color: '#EA580C' }}>{inv.token.slice(0, 8)}...</code>
                            <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: isRevoked ? 'rgba(239,68,68,0.1)' : isExpired ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)', color: isRevoked ? '#ef4444' : isExpired ? '#f59e0b' : '#10b981' }}>
                              {isRevoked ? 'Revoked' : isExpired ? 'Expired' : 'Active'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#D4D4D8', marginTop: '4px' }}>Expires {new Date(inv.expiresAt).toLocaleDateString()}</div>
                        </div>
                        {isActive && (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {user?.workspaceRole === 'owner' && (
                              <button onClick={() => handleRevokeInvite(inv.id)} style={{ background: 'none', border: 'none', color: '#D4D4D8', cursor: 'pointer', fontSize: '0.8rem' }}>Revoke</button>
                            )}
                            <button onClick={async () => { await navigator.clipboard.writeText(`${DASHBOARD_BASE}/invite/${inv.token}`); alert('Copied!'); }} style={{ background: 'rgba(234,88,12,0.1)', border: 'none', color: '#EA580C', cursor: 'pointer', fontSize: '0.8rem', padding: '4px 10px', borderRadius: '6px' }}>Copy</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowMembersModal(false)} style={{ background: '#EA580C', color: '#fff', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '9999px', fontWeight: 600, cursor: 'pointer' }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Confirm */}
      {showLeaveConfirm && (
        <div className="sv-modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="sv-modal-panel" style={{ background: '#18181b', padding: '2rem', borderRadius: '12px', maxWidth: '400px', width: '90%', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 style={{ color: '#fff', fontSize: '1.25rem', marginBottom: '1rem' }}>Leave this workspace?</h3>
            <ul style={{ color: '#D4D4D8', marginBottom: '2rem', paddingLeft: '1.2rem', lineHeight: 1.6 }}>
              <li>You will lose access to shared videos.</li>
              <li>You will need a new invite to rejoin.</li>
            </ul>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowLeaveConfirm(false)} style={{ padding: '0.5rem 1rem', background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleLeaveWorkspace} disabled={leaving} style={{ padding: '0.5rem 1rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: leaving ? 'not-allowed' : 'pointer' }}>{leaving ? 'Leaving...' : 'Leave'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Move to Folder */}
      {moveFolderTarget && (
        <div className="sv-modal-backdrop" onClick={() => setMoveFolderTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
          <div className="sv-modal-panel" onClick={e => e.stopPropagation()} style={{ background: '#18181b', padding: '1.5rem', borderRadius: '1.1rem', maxWidth: '360px', width: '90%', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 40px -12px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '1.25rem' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: 'rgba(234,88,12,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                </svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 700 }}>Move recording</h3>
                <p style={{ color: '#D4D4D8', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{moveFolderTarget.title}</p>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '40vh', overflowY: 'auto' }}>
              <button
                className="sv-btn-ghost"
                onClick={() => handleMoveToFolder(moveFolderTarget, null)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', textAlign: 'left', padding: '0.6rem 0.75rem', background: 'transparent', border: '1px dashed rgba(255,255,255,0.14)', borderRadius: '9px', color: '#D4D4D8', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                  <line x1="3" y1="21" x2="21" y2="3" />
                </svg>
                No folder
              </button>
              {folders.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '8px 0 2px' }}>
                  <span style={{ fontSize: '0.65rem', color: '#8b8b93', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Folders</span>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
                </div>
              )}
              {folders.map((f, i) => (
                <button
                  key={f.id}
                  className="sv-btn-ghost sv-row-in"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', textAlign: 'left', padding: '0.6rem 0.75rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '9px', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', animationDelay: `${i * 20}ms` }}
                  onClick={() => handleMoveToFolder(moveFolderTarget, f.id)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                  </svg>
                  {f.name}
                </button>
              ))}
              {!folders.length && <p style={{ color: '#D4D4D8', fontSize: '0.8rem', padding: '0.5rem 0.1rem' }}>No folders yet — create one from the sidebar first.</p>}
            </div>
            <button className="sv-btn-ghost sv-btn-press" onClick={() => setMoveFolderTarget(null)} style={{ marginTop: '1rem', width: '100%', padding: '0.6rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '9px', color: '#D4D4D8', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Move to Workspace */}
      {moveWorkspaceTarget && (
        <div className="sv-modal-backdrop" onClick={() => setMoveWorkspaceTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
          <div className="sv-modal-panel" onClick={e => e.stopPropagation()} style={{ background: '#18181b', padding: '1.5rem', borderRadius: '1.1rem', maxWidth: '360px', width: '90%', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 40px -12px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '0.5rem' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
                </svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 700 }}>Move to workspace</h3>
                <p style={{ color: '#D4D4D8', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{moveWorkspaceTarget.title}</p>
              </div>
            </div>
            <p style={{ color: '#D4D4D8', fontSize: '0.75rem', marginBottom: '1rem' }}>This unfiles the recording from its current folder.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '40vh', overflowY: 'auto' }}>
              {workspacesList.filter(w => w.id !== user?.workspaceId).map((w, i) => (
                <button
                  key={w.id}
                  className="sv-btn-ghost sv-row-in"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', textAlign: 'left', padding: '0.6rem 0.75rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '9px', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', animationDelay: `${i * 20}ms` }}
                  onClick={() => handleMoveToWorkspace(moveWorkspaceTarget, w.id)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
                  </svg>
                  {w.name}
                </button>
              ))}
              {workspacesList.filter(w => w.id !== user?.workspaceId).length === 0 && <p style={{ color: '#D4D4D8', fontSize: '0.8rem', padding: '0.5rem 0.1rem' }}>You're not a member of any other workspace.</p>}
            </div>
            <button className="sv-btn-ghost sv-btn-press" onClick={() => setMoveWorkspaceTarget(null)} style={{ marginTop: '1rem', width: '100%', padding: '0.6rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '9px', color: '#D4D4D8', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
          </div>
        </div>
      )}

      {!files.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {uploadCard}
          <div style={{ color: '#D4D4D8', alignSelf: 'center', padding: '1rem' }}>
            <p style={{ marginBottom: '0.5rem' }}>No recordings yet in this workspace.</p>
            <p style={{ fontSize: '0.9rem' }}>Upload a file, or use the Chrome extension to record.</p>
          </div>
        </div>
      ) : (
        <>
          <div style={{ position: 'relative', marginBottom: '2rem' }}>
            <input
              id="search-input"
              autoFocus
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setSearchQuery(''); }}
              placeholder="Search recordings... (Press /)"
              style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1rem', padding: '0.8rem 1.2rem 0.8rem 2.8rem', color: '#fff', fontSize: '1rem', outline: 'none' }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
            />
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }}>
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            {searchQuery && <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '1.5rem' }}>
            {([
              { label: 'Type', value: typeFilter, set: setTypeFilter, options: [['all', 'All types'], ['video', 'Videos'], ['image', 'Images'], ['audio', 'Audio']] },
              { label: 'Owner', value: ownerFilter, set: setOwnerFilter, options: [['all', 'Everyone'], ['mine', 'Mine']] },
              { label: 'Sort', value: sortBy, set: setSortBy, options: [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['name-asc', 'Name A–Z'], ['name-desc', 'Name Z–A']] },
            ] as { label: string; value: string; set: (v: any) => void; options: string[][] }[]).map(f => (
              <label key={f.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${f.value !== f.options[0][0] ? 'rgba(234,88,12,0.5)' : 'rgba(255,255,255,0.08)'}`, borderRadius: '9999px', padding: '0.4rem 0.9rem', fontSize: '0.8rem', color: '#8b8b93' }}>
                {f.label}
                <select value={f.value} onChange={e => f.set(e.target.value)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '0.8rem', fontWeight: 600, outline: 'none', cursor: 'pointer' }}>
                  {f.options.map(([v, l]) => <option key={v} value={v} style={{ background: '#18181b' }}>{l}</option>)}
                </select>
              </label>
            ))}
            {filtersActive && (
              <button onClick={() => { setTypeFilter('all'); setOwnerFilter('all'); setSortBy('newest'); }} style={{ background: 'none', border: 'none', color: '#EA580C', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>Reset</button>
            )}
          </div>

          {!filteredFiles.length ? (
            <div style={{ textAlign: 'center', padding: '4rem 0', color: '#D4D4D8' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#fff', marginBottom: '0.5rem' }}>No results found</div>
              <div>{searchQuery ? `We couldn't find any recordings matching "${searchQuery}"` : 'No recordings match these filters.'}</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
              {!debouncedQuery && !filtersActive && uploadCard}
              {filteredFiles.map((file, i) => (
                <div
                  key={file.id}
                  className="sv-card sv-row-in"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative', animationDelay: `${Math.min(i, 12) * 25}ms` }}
                  onMouseLeave={() => setMenuOpenId(null)}
                >
                  {/* Actions Menu */}
                  <div style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 10 }}>
                    <button
                      className="sv-icon-btn"
                      onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === file.id ? null : file.id); }}
                      style={{ background: 'rgba(0,0,0,0.4)', border: 'none', color: '#fff', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', backdropFilter: 'blur(4px)' }}
                    >⋯</button>
                    {menuOpenId === file.id && (
                      <div className="sv-menu-panel" style={{ position: 'absolute', top: '40px', right: '0', background: '#18181B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)', padding: '6px', minWidth: '140px', zIndex: 100 }}>
                        {[
                          { label: copiedId === file.id ? 'Copied!' : 'Copy Link', onClick: (e: React.MouseEvent) => { copyLink(e, file); setMenuOpenId(null); } },
                          ...(file.ownerId === user?.userId ? [{ label: 'Download original', onClick: (e: React.MouseEvent) => { e.stopPropagation(); handleDownload(file); setMenuOpenId(null); } }] : []),
                          { label: 'Rename', onClick: (e: React.MouseEvent) => { e.stopPropagation(); setEditingId(file.id); setEditingTitle(file.title); setMenuOpenId(null); } },
                          { label: 'Move to Folder', onClick: (e: React.MouseEvent) => { e.stopPropagation(); setMoveFolderTarget(file); setMenuOpenId(null); } },
                          { label: 'Move to Workspace', onClick: (e: React.MouseEvent) => { e.stopPropagation(); setMoveWorkspaceTarget(file); setMenuOpenId(null); } },
                        ].map(item => (
                          <button key={item.label} onClick={item.onClick} style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: '#fff', fontSize: '0.875rem', cursor: 'pointer', borderRadius: '8px', textAlign: 'left' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >{item.label}</button>
                        ))}
                        <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '4px 0' }} />
                        <button onClick={e => { e.stopPropagation(); handleDelete(file); setMenuOpenId(null); }} style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', color: '#EF4444', fontSize: '0.875rem', cursor: 'pointer', borderRadius: '8px', textAlign: 'left' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >Delete</button>
                      </div>
                    )}
                  </div>

                  {/* Thumbnail */}
                  <div
                    style={{ position: 'relative', cursor: 'pointer' }}
                    onMouseEnter={() => {
                      setHoveredId(file.id);
                      videoRefs.current.get(file.id)?.play().catch(() => {});
                    }}
                    onMouseLeave={() => {
                      setHoveredId(null);
                      const v = videoRefs.current.get(file.id);
                      if (v) { v.pause(); v.currentTime = PREVIEW_START; }
                    }}
                    onClick={() => openVideo(file)}
                  >
                    <div style={{ aspectRatio: '16/9', background: '#050505', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                      {extractStreamId(file.playerUrl) && file.mediaType === 'image' ? (
                        <img
                          src={`${STREAM_BASE}/?id=${extractStreamId(file.playerUrl)}`}
                          alt={file.title}
                          loading="lazy"
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: hoveredId === file.id ? 0.85 : 1, transition: 'opacity 0.2s' }}
                        />
                      ) : extractStreamId(file.playerUrl) ? (
                        <video
                          key={file.id}
                          ref={el => { if (el) videoRefs.current.set(file.id, el); else videoRefs.current.delete(file.id); }}
                          src={`${STREAM_BASE}/?id=${extractStreamId(file.playerUrl)}`}
                          muted
                          loop={false}
                          playsInline
                          preload="metadata"
                          onLoadedMetadata={e => {
                            const dur = e.currentTarget.duration;
                            e.currentTarget.currentTime = isFinite(dur) && dur > 0 ? Math.min(PREVIEW_START, dur / 2) : PREVIEW_START;
                          }}
                          onTimeUpdate={e => {
                            if (e.currentTarget.currentTime >= PREVIEW_START + PREVIEW_LOOP_SECONDS) {
                              e.currentTarget.currentTime = PREVIEW_START;
                            }
                          }}
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: hoveredId === file.id ? 0.85 : 1, transition: 'opacity 0.2s' }}
                        />
                      ) : file.thumbnailLink ? (
                        <img src={file.thumbnailLink} alt={file.title} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: hoveredId === file.id ? 0.8 : 1, transition: 'opacity 0.2s' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(45deg, #18181B, #09090B)' }}>
                          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1">
                            <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>
                          </svg>
                        </div>
                      )}
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hoveredId === file.id ? 'rgba(0,0,0,0.2)' : 'transparent', transition: 'background 0.2s' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: hoveredId === file.id ? 1 : 0, transform: hoveredId === file.id ? 'scale(1)' : 'scale(0.8)', transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {editingId === file.id ? (
                      <input
                        autoFocus
                        value={editingTitle}
                        onChange={e => setEditingTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRename(file); if (e.key === 'Escape') setEditingId(null); }}
                        onClick={e => e.stopPropagation()}
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '4px 8px', color: '#fff', width: '100%', fontSize: '0.9rem', outline: 'none' }}
                      />
                    ) : (
                      <div style={{ fontWeight: 600, fontSize: '1rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {highlightMatch(file.title || '', debouncedQuery)}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: getDeterministicColor(file.accountEmail || ''), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 'bold', color: '#fff', flexShrink: 0 }}>
                        {(file.accountEmail || 'S').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#D4D4D8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.accountEmail === user?.email ? 'You' : file.accountEmail}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: '#8b8b93' }}>
                      {new Date(file.createdTime || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {loadingMore && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem', marginTop: '1.5rem' }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', overflow: 'hidden' }}>
                  <div className="skeleton" style={{ height: '160px', borderRadius: 0 }} />
                  <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <div className="skeleton" style={{ height: '14px', width: '70%' }} />
                    <div className="skeleton" style={{ height: '12px', width: '45%' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {hasMore && <div ref={observerTarget} style={{ height: '40px', marginTop: '1rem' }} />}
        </>
      )}
    </div>
  );
}
