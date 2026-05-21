import React, { useEffect, useState, useRef, useMemo } from 'react';
import { apiClient } from '../lib/apiClient';

// ─── Types (keep original API shapes) ─────────────────────────────────────────

interface SopRow {
  sopId: string;
  title: string;
  views: number;
  completionRate: number;
  avgDwellMs: number;
  problemStep: number | null;
}

interface StepData {
  stepIndex: number;
  views: number;
  replays: number;
  skips: number;
  avgDwellMs: number;
  dropoffAfter: number;
}

interface WorkspaceAnalytics {
  workspaceId: string;
  period: string;
  totalSessions: number;
  totalViews: number;
  sops: SopRow[];
}

interface SopAnalytics {
  sopId: string;
  totalViews: number;
  completionRate: number;
  avgCompletionTimeMs: number;
  steps: StepData[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMs(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

const SOP_COLORS = ['#5E5CE6', '#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#3B82F6'];
function sopColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return SOP_COLORS[h % SOP_COLORS.length];
}
function sopInitials(title: string): string {
  return title.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '??';
}
function interpColor(a: string, b: string, t: number): string {
  const hx = (s: string) => ({ r: parseInt(s.slice(1,3),16), g: parseInt(s.slice(3,5),16), bl: parseInt(s.slice(5,7),16) });
  const ca = hx(a), cb = hx(b);
  return `rgb(${Math.round(ca.r+(cb.r-ca.r)*t)},${Math.round(ca.g+(cb.g-ca.g)*t)},${Math.round(ca.bl+(cb.bl-ca.bl)*t)})`;
}
function retentionColor(r: number): string {
  if (r >= 60) return interpColor('#F59E0B', '#10B981', (r - 60) / 40);
  if (r >= 30) return interpColor('#EF4444', '#F59E0B', (r - 30) / 30);
  return '#EF4444';
}

// ─── Inline icons ─────────────────────────────────────────────────────────────

const Ic = {
  eye:      (c='currentColor',sz=16) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>,
  users:    (c='currentColor',sz=16) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="9" r="3"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="8" r="2.5"/><path d="M15.5 14c3 .3 5.5 2.2 5.5 5"/></svg>,
  bolt:     (c='currentColor',sz=16) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M13 3 4 14h6l-1 7 9-11h-6l1-7Z"/></svg>,
  star:     (c='currentColor',sz=16) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 2.7 5.7 6.3.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.3-.9L12 3Z"/></svg>,
  up:       (c='currentColor',sz=16) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="m6 14 6-6 6 6"/></svg>,
  down:     (c='currentColor',sz=16) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="m6 10 6 6 6-6"/></svg>,
  sort:     (c='currentColor',sz=16) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m8 9 4-4 4 4"/><path d="m8 15 4 4 4-4"/></svg>,
  chev:     (c='currentColor',sz=16) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6"/></svg>,
  calendar: (c='currentColor',sz=16) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>,
  share:    (c='currentColor',sz=16) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="12" r="2.25"/><circle cx="18" cy="6" r="2.25"/><circle cx="18" cy="18" r="2.25"/><path d="m8 11 8-4M8 13l8 4"/></svg>,
  download: (c='currentColor',sz=16) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11m-5-4 5 5 5-5M5 20h14"/></svg>,
};

// ─── Sparkline ─────────────────────────────────────────────────────────────────

const Sparkline: React.FC<{ data: number[]; color?: string; height?: number }> = ({
  data, color = '#5E5CE6', height = 36,
}) => {
  const w = 200, h = height;
  const max = Math.max(...data, 1), min = Math.min(...data);
  const py = 4, stepX = w / Math.max(data.length - 1, 1);
  const pts = data.map((v, i) => [i * stepX, h - py - ((v - min) / (max - min || 1)) * (h - py * 2)] as [number,number]);
  const path = pts.map(([x,y], i) => `${i===0?'M':'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${path} L${w},${h} L0,${h} Z`;
  const gid = `sg${color.replace('#','')}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ─── Donut ─────────────────────────────────────────────────────────────────────

interface DonutSlice { id: string; name: string; count: number; color: string; }
const Donut: React.FC<{ data: DonutSlice[]; size?: number; thickness?: number; centerLabel: string; centerSub: string }> = ({
  data, size = 192, thickness = 26, centerLabel, centerSub,
}) => {
  const r = size / 2, ir = r - thickness;
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const gap = 0.012;
  let angle = -Math.PI / 2 + gap / 2;
  const arcs = data.map(d => {
    const frac = d.count / total;
    const a0 = angle, a1 = angle + frac * Math.PI * 2 - gap;
    angle += frac * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0=r+r*Math.cos(a0), y0=r+r*Math.sin(a0);
    const x1=r+r*Math.cos(a1), y1=r+r*Math.sin(a1);
    const xi1=r+ir*Math.cos(a1), yi1=r+ir*Math.sin(a1);
    const xi0=r+ir*Math.cos(a0), yi0=r+ir*Math.sin(a0);
    const path = `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L ${xi1.toFixed(2)} ${yi1.toFixed(2)} A ${ir} ${ir} 0 ${large} 0 ${xi0.toFixed(2)} ${yi0.toFixed(2)} Z`;
    return { ...d, path, frac };
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {arcs.map(a => <path key={a.id} d={a.path} fill={a.color} />)}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', pointerEvents: 'none' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{centerLabel}</div>
            <div style={{ fontSize: 11.5, color: '#8A8A95', marginTop: 2 }}>{centerSub}</div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {arcs.map(a => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: '#4A4A55', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
            <span style={{ fontSize: 12, color: '#8A8A95', fontVariantNumeric: 'tabular-nums', marginLeft: 4 }}>{a.count.toLocaleString()}</span>
            <span style={{ fontSize: 11.5, color: '#B8B8C2', width: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(a.frac * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Line Chart (SOP views bar vis) ────────────────────────────────────────────

const ViewsBarChart: React.FC<{ sops: SopRow[] }> = ({ sops }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!wrapRef.current) return;
    const update = () => setWidth(wrapRef.current!.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);
  const top = sops.slice().sort((a, b) => b.views - a.views).slice(0, 8);
  const maxV = Math.max(...top.map(s => s.views), 1);
  const padL = 40, padR = 16, padT = 12, padB = 32;
  const innerW = width - padL - padR;
  const innerH = 200 - padT - padB;
  const barW = Math.max(6, innerW / top.length - 10);
  const step = innerW / Math.max(top.length, 1);

  return (
    <div ref={wrapRef} style={{ width: '100%', position: 'relative' }}>
      <svg viewBox={`0 0 ${width} 200`} width="100%" height={200}>
        {/* Y grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
          const y = padT + innerH * (1 - t);
          const v = Math.round(maxV * t);
          return (
            <g key={i}>
              <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="#ECECEF" strokeDasharray={t === 0 ? '0' : '3 4'} strokeWidth="1" />
              <text x={padL - 6} y={y + 3.5} textAnchor="end" fontSize="10" fill="#8A8A95" style={{ fontVariantNumeric: 'tabular-nums' }}>{v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}</text>
            </g>
          );
        })}
        {/* Bars */}
        {top.map((s, i) => {
          const bh = (s.views / maxV) * innerH;
          const x = padL + i * step + step / 2 - barW / 2;
          const y = padT + innerH - bh;
          const color = sopColor(s.sopId);
          const initials = sopInitials(s.title);
          return (
            <g key={s.sopId}>
              <rect x={x} y={y} width={barW} height={bh} rx={4} fill={color} opacity={0.85} />
              <text x={x + barW / 2} y={200 - padB + 14} textAnchor="middle" fontSize="9.5" fill="#8A8A95">
                {initials}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ─── Stat Card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  labelIcon?: React.ReactNode;
  value: React.ReactNode;
  sub?: string;
  delta?: string;
  deltaDir?: 'up' | 'down';
  foot?: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ label, labelIcon, value, sub, delta, deltaDir, foot }) => (
  <div style={{
    flex: 1, background: '#FFFFFF', borderRadius: 16, border: '1px solid #ECECEF',
    boxShadow: '0 1px 3px rgba(16,18,27,0.04),0 6px 24px -8px rgba(16,18,27,0.06)',
    padding: '20px 20px 16px', display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
      {labelIcon && <span style={{ color: '#B8B8C2' }}>{labelIcon}</span>}
      <span style={{ fontSize: 12, fontWeight: 600, color: '#8A8A95', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: sub ? 4 : 0 }}>
      <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1, color: '#0B0B0F' }}>{value}</span>
      {delta && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12, fontWeight: 600,
          color: deltaDir === 'up' ? '#10B981' : '#EF4444',
          background: deltaDir === 'up' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          borderRadius: 99, padding: '2px 7px',
        }}>
          {deltaDir === 'up' ? Ic.up('#10B981', 10) : Ic.down('#EF4444', 10)} {delta}
        </span>
      )}
    </div>
    {sub && <div style={{ fontSize: 12, color: '#8A8A95', marginBottom: 12 }}>{sub}</div>}
    {foot && <div style={{ marginTop: 'auto', paddingTop: sub ? 0 : 12 }}>{foot}</div>}
  </div>
);

// ─── SOP Table ─────────────────────────────────────────────────────────────────

type SortKey = 'views' | 'completionRate' | 'avgDwellMs';
type SortDir = 'asc' | 'desc';

const SopTable: React.FC<{
  sops: SopRow[];
  expandedId: string | null;
  onExpand: (id: string | null) => void;
  sopDetail: SopAnalytics | null;
  detailLoading: boolean;
}> = ({ sops, expandedId, onExpand, sopDetail, detailLoading }) => {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'views', dir: 'desc' });

  const sorted = useMemo(() => {
    const copy = [...sops];
    copy.sort((a, b) => {
      const av = a[sort.key] as number, bv = b[sort.key] as number;
      return sort.dir === 'desc' ? bv - av : av - bv;
    });
    return copy;
  }, [sops, sort]);

  const onSort = (k: SortKey) => setSort(prev =>
    prev.key === k ? { key: k, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key: k, dir: 'desc' }
  );

  const ThSort: React.FC<{ label: string; k: SortKey; align?: 'left' | 'right' }> = ({ label, k, align = 'right' }) => {
    const active = sort.key === k;
    return (
      <th onClick={() => onSort(k)} style={{
        padding: '10px 16px', textAlign: align, fontSize: 11, fontWeight: 700,
        color: active ? '#5E5CE6' : '#8A8A95', textTransform: 'uppercase', letterSpacing: '0.06em',
        cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
      }}>
        {label} <span style={{ opacity: 0.7 }}>{active ? (sort.dir === 'asc' ? '↑' : '↓') : ''}</span>
        {!active && <span style={{ opacity: 0.4, display: 'inline-block', verticalAlign: 'middle', marginLeft: 2 }}>{Ic.sort('#8A8A95', 11)}</span>}
      </th>
    );
  };

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #ECECEF' }}>
          <th style={{ width: 28 }} />
          <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#8A8A95', textTransform: 'uppercase', letterSpacing: '0.06em' }}>SOP</th>
          <ThSort label="Views" k="views" />
          <ThSort label="Completion" k="completionRate" />
          <ThSort label="Avg dwell" k="avgDwellMs" />
          <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#8A8A95', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Problem step</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(sop => {
          const expanded = expandedId === sop.sopId;
          const color = sopColor(sop.sopId);
          const initials = sopInitials(sop.title);
          const completion = Math.round(sop.completionRate * 100);
          const dropoffTone = completion < 40 ? '#EF4444' : completion < 70 ? '#F59E0B' : '#10B981';
          return (
            <React.Fragment key={sop.sopId}>
              <tr
                onClick={() => onExpand(expanded ? null : sop.sopId)}
                style={{
                  borderBottom: '1px solid #ECECEF', cursor: 'pointer',
                  background: expanded ? 'rgba(94,92,230,0.04)' : 'transparent',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLTableRowElement).style.background = '#F9F9FC'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = expanded ? 'rgba(94,92,230,0.04)' : 'transparent'; }}
              >
                <td style={{ paddingLeft: 18, paddingRight: 0 }}>
                  <span style={{
                    display: 'inline-flex', color: '#B8B8C2',
                    transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s',
                  }}>
                    {Ic.chev('#B8B8C2', 14)}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, background: color, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.01em',
                    }}>{initials}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5, color: '#0B0B0F', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 280 }}>{sop.title}</div>
                      <div style={{ fontSize: 11.5, color: '#8A8A95', marginTop: 1 }}>{fmtMs(sop.avgDwellMs)} avg · {sop.views.toLocaleString()} views</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontSize: 13.5 }}>{sop.views.toLocaleString()}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 52, height: 6, background: '#F2F2F5', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${completion}%`, height: '100%', background: dropoffTone, borderRadius: 99 }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: dropoffTone, fontVariantNumeric: 'tabular-nums', minWidth: 34, textAlign: 'right' }}>{completion}%</span>
                  </div>
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', color: '#4A4A55', fontVariantNumeric: 'tabular-nums' }}>{fmtMs(sop.avgDwellMs)}</td>
                <td style={{ padding: '12px 16px' }}>
                  {sop.problemStep != null
                    ? <span style={{ fontSize: 12, fontWeight: 600, color: '#F59E0B', background: 'rgba(245,158,11,0.1)', padding: '3px 8px', borderRadius: 99 }}>Step {sop.problemStep + 1} ⚠</span>
                    : <span style={{ color: '#B8B8C2' }}>—</span>}
                </td>
              </tr>
              {expanded && (
                <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #ECECEF' }}>
                  <td colSpan={6} style={{ padding: '0 24px 16px' }}>
                    {detailLoading && (
                      <div style={{ padding: '20px 0', color: '#8A8A95', fontSize: 13 }}>Loading step breakdown…</div>
                    )}
                    {sopDetail && !detailLoading && (
                      <InlineStepBreakdown steps={sopDetail.steps} />
                    )}
                    {!sopDetail && !detailLoading && (
                      <div style={{ padding: '20px 0', color: '#8A8A95', fontSize: 13 }}>No step data available.</div>
                    )}
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
        {sorted.length === 0 && (
          <tr>
            <td colSpan={6} style={{ padding: '48px 0', textAlign: 'center', color: '#8A8A95', fontSize: 13.5 }}>No SOP data yet.</td>
          </tr>
        )}
      </tbody>
    </table>
  );
};

// ─── Inline step breakdown (inside expanded table row) ──────────────────────────

const InlineStepBreakdown: React.FC<{ steps: StepData[] }> = ({ steps }) => {
  const maxV = Math.max(...steps.map(s => s.views), 1);
  return (
    <div style={{ paddingTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#4A4A55', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Step-by-step view counts</span>
        <span style={{ marginLeft: 8, fontSize: 11.5, background: 'rgba(94,92,230,0.1)', color: '#5E5CE6', padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>{steps.length} steps</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#8A8A95' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#F59E0B', display: 'inline-block' }} /> &lt;60% retention
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#EF4444', display: 'inline-block', marginLeft: 6 }} /> &lt;30% retention
        </div>
      </div>
      {steps.map((s, i) => {
        const retention = Math.round((s.views / maxV) * 100);
        const tone = retention < 30 ? '#EF4444' : retention < 60 ? '#F59E0B' : '#10B981';
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '5px 0', borderBottom: i < steps.length - 1 ? '1px solid #F0F0F3' : 'none' }}>
            <div style={{ width: 24, fontSize: 11, fontWeight: 700, color: '#B8B8C2', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
              {String(i + 1).padStart(2, '0')}
            </div>
            <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#0B0B0F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Step {s.stepIndex + 1}
              <span style={{ color: '#8A8A95', marginLeft: 8, fontSize: 11.5 }}>{s.views.toLocaleString()} views · {fmtMs(s.avgDwellMs)} avg</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <div style={{ width: 140, height: 6, background: '#F2F2F5', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ width: `${retention}%`, height: '100%', background: tone, borderRadius: 99 }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: tone, width: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{retention}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Full step heatmap card ─────────────────────────────────────────────────────

const StepHeatmapCard: React.FC<{ sopDetail: SopAnalytics; sopTitle: string }> = ({ sopDetail, sopTitle }) => {
  const { steps } = sopDetail;
  const maxV = Math.max(...steps.map(s => s.views), 1);

  return (
    <div style={{
      background: '#FFFFFF', borderRadius: 16, border: '1px solid #ECECEF',
      boxShadow: '0 1px 3px rgba(16,18,27,0.04),0 6px 24px -8px rgba(16,18,27,0.06)',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid #ECECEF' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>Step-by-step drop-off · <span style={{ color: '#5E5CE6' }}>{sopTitle}</span></h3>
          <div style={{ marginTop: 3, fontSize: 13, color: '#8A8A95' }}>Where viewers stopped watching this SOP, by step.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8A8A95' }}>
          <span style={{ color: '#B91C1C' }}>&lt;30%</span>
          <div style={{ width: 60, height: 6, borderRadius: 99, background: 'linear-gradient(90deg,#EF4444 0%,#F59E0B 50%,#10B981 100%)' }} />
          <span style={{ color: '#047857' }}>100%</span>
        </div>
      </div>
      <div style={{ padding: '4px 0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ECECEF' }}>
              <th style={{ padding: '8px 24px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#8A8A95', textTransform: 'uppercase', letterSpacing: '0.06em', width: 70 }}>Step</th>
              <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#8A8A95', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Details</th>
              <th style={{ padding: '8px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#8A8A95', textTransform: 'uppercase', letterSpacing: '0.06em', width: 120 }}>View count</th>
              <th style={{ padding: '8px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#8A8A95', textTransform: 'uppercase', letterSpacing: '0.06em', width: 110 }}>Retention</th>
              <th style={{ padding: '8px 24px 8px 16px', fontSize: 11, fontWeight: 700, color: '#8A8A95', textTransform: 'uppercase', letterSpacing: '0.06em', width: '38%' }}>Heatmap</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((s, i) => {
              const retention = Math.round((s.views / maxV) * 100);
              const color = retentionColor(retention);
              const isFirst = i === 0;
              return (
                <tr key={i} style={{ borderBottom: i < steps.length - 1 ? '1px solid #F5F5F7' : 'none' }}>
                  <td style={{ padding: '10px 24px' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 26, height: 26, borderRadius: 8,
                      background: isFirst ? '#5E5CE6' : '#F2F2F5',
                      color: isFirst ? '#FFFFFF' : '#4A4A55',
                      fontSize: 12, fontWeight: 700,
                    }}>{i + 1}</span>
                  </td>
                  <td style={{ padding: '10px 16px', fontWeight: 500, color: '#0B0B0F' }}>
                    Step {s.stepIndex + 1}
                    <div style={{ fontSize: 11.5, color: '#8A8A95', marginTop: 1 }}>
                      {fmtMs(s.avgDwellMs)} avg · {s.replays > 0 ? `${s.replays} replay${s.replays !== 1 ? 's' : ''}` : 'no replays'}
                      {s.skips > 0 && ` · ${s.skips} skipped`}
                    </div>
                  </td>
                  <td style={{ padding: '10px 16px', textAlign: 'right', color: '#4A4A55', fontVariantNumeric: 'tabular-nums' }}>{s.views.toLocaleString()}</td>
                  <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                    <span style={{
                      display: 'inline-block', padding: '3px 8px', borderRadius: 99, fontSize: 12, fontWeight: 700,
                      background: retention >= 60 ? 'rgba(16,185,129,0.1)' : retention >= 30 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                      color,
                    }}>{retention}%</span>
                  </td>
                  <td style={{ padding: '10px 16px 10px 16px' }}>
                    <div style={{ height: 8, background: '#F2F2F5', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${retention}%`, height: '100%', background: color, borderRadius: 99 }} />
                    </div>
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

// ─── Main Page ─────────────────────────────────────────────────────────────────

export const AnalyticsPage: React.FC = () => {
  const [workspace, setWorkspace] = useState<WorkspaceAnalytics | null>(null);
  const [sopDetail, setSopDetail] = useState<SopAnalytics | null>(null);
  const [selectedSopId, setSelectedSopId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiClient.get<WorkspaceAnalytics>('/analytics/workspace')
      .then(setWorkspace)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSelectSop = async (sopId: string | null) => {
    setSelectedSopId(sopId);
    if (!sopId) { setSopDetail(null); return; }
    setDetailLoading(true);
    setSopDetail(null);
    try {
      const data = await apiClient.get<SopAnalytics>(`/analytics/sops/${sopId}`);
      setSopDetail(data);
    } catch {
      setSopDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const avgCompletion = workspace && workspace.sops.length > 0
    ? workspace.sops.reduce((s, r) => s + r.completionRate, 0) / workspace.sops.length
    : 0;

  const topSop = workspace?.sops.slice().sort((a, b) => b.views - a.views)[0] ?? null;

  const selectedSopTitle = workspace?.sops.find(s => s.sopId === selectedSopId)?.title ?? '';

  // Donut data: completion vs. not, per total SOP views breakdown
  const donutData: DonutSlice[] = workspace?.sops.slice(0, 5).map(s => ({
    id: s.sopId,
    name: s.title.length > 28 ? s.title.slice(0, 28) + '…' : s.title,
    count: s.views,
    color: sopColor(s.sopId),
  })) ?? [];

  const totalViews = workspace?.totalViews ?? 0;

  // Sparkline data from SOP views (descending sorted, take views as sequential points)
  const sparkViews = workspace?.sops.slice().sort((a, b) => a.views - b.views).map(s => s.views) ?? [0];
  const sparkCompletion = workspace?.sops.slice().sort((a, b) => a.completionRate - b.completionRate).map(s => Math.round(s.completionRate * 100)) ?? [0];

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '32px 40px 64px', background: '#F5F5F7', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', color: '#0B0B0F' }}>Analytics</h1>
          <div style={{ marginTop: 4, fontSize: 14.5, color: '#8A8A95' }}>Understand how your knowledge base is being consumed.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#FFFFFF', border: '1px solid #DEDEE3', borderRadius: 10,
            padding: '8px 14px', fontSize: 13, fontWeight: 500, color: '#4A4A55',
            cursor: 'pointer', boxShadow: '0 1px 2px rgba(16,18,27,0.04)',
          }}>
            {Ic.download('#8A8A95', 14)} Export
          </button>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#FFFFFF', border: '1px solid #DEDEE3', borderRadius: 10,
            padding: '8px 12px', fontSize: 13, fontWeight: 500, color: '#0B0B0F',
            boxShadow: '0 1px 2px rgba(16,18,27,0.04)',
          }}>
            {Ic.calendar('#8A8A95', 14)}
            <span>Last 30 days</span>
            <span style={{ color: '#8A8A95', marginLeft: 2 }}>{Ic.down('#8A8A95', 14)}</span>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '96px 0', color: '#8A8A95', fontSize: 14 }}>
          Loading analytics…
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div style={{ borderRadius: 12, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', padding: '16px 20px', color: '#B91C1C', fontSize: 13.5 }}>
          {error.includes('403') ? 'Admin access required to view workspace analytics.' : error}
        </div>
      )}

      {workspace && !loading && (
        <>
          {/* Stat cards row */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
            <StatCard
              label="Total SOP views"
              labelIcon={Ic.eye('#B8B8C2', 13)}
              value={totalViews.toLocaleString()}
              sub="vs. previous 30 days"
              foot={<Sparkline data={sparkViews.length > 1 ? sparkViews : [0, totalViews]} color="#5E5CE6" height={36} />}
            />
            <StatCard
              label="Avg completion"
              labelIcon={Ic.bolt('#B8B8C2', 13)}
              value={`${Math.round(avgCompletion * 100)}%`}
              sub="across all SOPs this period"
              foot={<Sparkline data={sparkCompletion.length > 1 ? sparkCompletion : [0, Math.round(avgCompletion * 100)]} color="#10B981" height={36} />}
            />
            <StatCard
              label="Total sessions"
              labelIcon={Ic.users('#B8B8C2', 13)}
              value={workspace.totalSessions.toLocaleString()}
              sub="viewer sessions this period"
              foot={<Sparkline data={sparkViews.length > 1 ? [...sparkViews].reverse() : [0, workspace.totalSessions]} color="#8B5CF6" height={36} />}
            />
            <StatCard
              label="Most viewed SOP"
              labelIcon={Ic.star('#B8B8C2', 13)}
              value=""
              foot={topSop ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, background: sopColor(topSop.sopId),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, color: '#FFFFFF', flexShrink: 0,
                    }}>{sopInitials(topSop.title)}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{topSop.title}</div>
                      <div style={{ color: '#8A8A95', fontSize: 11.5, marginTop: 1 }}>{topSop.views.toLocaleString()} views</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, background: 'rgba(94,92,230,0.1)', color: '#5E5CE6', padding: '3px 8px', borderRadius: 99, fontWeight: 600 }}>
                      {Ic.eye('#5E5CE6', 11)} {topSop.views} views
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, background: 'rgba(16,185,129,0.1)', color: '#059669', padding: '3px 8px', borderRadius: 99, fontWeight: 600 }}>
                      {Math.round(topSop.completionRate * 100)}% completion
                    </span>
                  </div>
                </div>
              ) : <span style={{ color: '#B8B8C2', fontSize: 13 }}>No data yet</span>}
            />
          </div>

          {/* Charts row */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 20 }}>
            {/* Bar chart */}
            <div style={{
              background: '#FFFFFF', borderRadius: 16, border: '1px solid #ECECEF',
              boxShadow: '0 1px 3px rgba(16,18,27,0.04),0 6px 24px -8px rgba(16,18,27,0.06)',
              overflow: 'hidden',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid #ECECEF' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>SOP Views by Engagement</h3>
                  <div style={{ marginTop: 3, fontSize: 12.5, color: '#8A8A95' }}>Total views per SOP, sorted by engagement</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#8A8A95' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 10, height: 3, borderRadius: 2, background: '#5E5CE6', display: 'inline-block' }} /> This period
                  </span>
                </div>
              </div>
              <div style={{ padding: '16px 20px 8px' }}>
                {workspace.sops.length > 0
                  ? <ViewsBarChart sops={workspace.sops} />
                  : <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A8A95', fontSize: 13 }}>No SOP data yet</div>}
              </div>
            </div>

            {/* Donut chart */}
            <div style={{
              background: '#FFFFFF', borderRadius: 16, border: '1px solid #ECECEF',
              boxShadow: '0 1px 3px rgba(16,18,27,0.04),0 6px 24px -8px rgba(16,18,27,0.06)',
              overflow: 'hidden',
            }}>
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #ECECEF' }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>Views by SOP</h3>
                <div style={{ marginTop: 3, fontSize: 12.5, color: '#8A8A95' }}>Top 5 SOPs by view count</div>
              </div>
              <div style={{ padding: '20px 24px' }}>
                {donutData.length > 0
                  ? <Donut data={donutData} size={176} centerLabel={totalViews.toLocaleString()} centerSub="total views" />
                  : <div style={{ height: 176, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A8A95', fontSize: 13 }}>No data yet</div>}
              </div>
            </div>
          </div>

          {/* SOP Engagement Table */}
          <div style={{
            background: '#FFFFFF', borderRadius: 16, border: '1px solid #ECECEF',
            boxShadow: '0 1px 3px rgba(16,18,27,0.04),0 6px 24px -8px rgba(16,18,27,0.06)',
            overflow: 'hidden', marginBottom: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid #ECECEF' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>SOP Engagement</h3>
                <div style={{ marginTop: 3, fontSize: 12.5, color: '#8A8A95' }}>Tap any row to see step-by-step drop-off.</div>
              </div>
              <div style={{ fontSize: 12, color: '#8A8A95' }}>{workspace.sops.length} SOP{workspace.sops.length !== 1 ? 's' : ''}</div>
            </div>
            <div style={{ padding: '4px 0' }}>
              <SopTable
                sops={workspace.sops}
                expandedId={selectedSopId}
                onExpand={handleSelectSop}
                sopDetail={sopDetail}
                detailLoading={detailLoading}
              />
            </div>
          </div>

          {/* Full step heatmap card */}
          {selectedSopId && sopDetail && !detailLoading && sopDetail.steps.length > 0 && (
            <StepHeatmapCard sopDetail={sopDetail} sopTitle={selectedSopTitle} />
          )}

          {/* Empty state */}
          {workspace.sops.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '80px 0',
              background: '#FFFFFF', borderRadius: 16, border: '1px solid #ECECEF',
            }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#0B0B0F', marginBottom: 8 }}>No analytics data yet</div>
              <div style={{ fontSize: 13.5, color: '#8A8A95' }}>Events will appear here once viewers start watching your SOPs.</div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
