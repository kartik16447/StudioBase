import React from 'react';

interface Props {
  totalViews: number;
  avgCompletionRate: number;
  topSopTitle: string | null;
  totalSessions: number;
}

const Stat: React.FC<{ label: string; value: string | number; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="flex-1 bg-white rounded-xl p-5 flex flex-col gap-2 min-w-0 border border-border shadow-sm">
    <div className={`text-3xl font-bold tabular-nums ${accent ? 'text-primary' : 'text-[#1D1D1F]'}`}>{value}</div>
    <div className="text-[11px] font-semibold text-text-3 uppercase tracking-widest">{label}</div>
  </div>
);

export const WorkspaceSummary: React.FC<Props> = ({
  totalViews, avgCompletionRate, topSopTitle, totalSessions,
}) => (
  <div className="flex gap-4">
    <Stat label="Total Views" value={totalViews.toLocaleString()} />
    <Stat label="Avg Completion" value={`${Math.round(avgCompletionRate * 100)}%`} accent />
    <Stat label="Top SOP" value={topSopTitle ? topSopTitle.slice(0, 20) + (topSopTitle.length > 20 ? '…' : '') : '—'} />
    <Stat label="Total Sessions" value={totalSessions.toLocaleString()} />
  </div>
);
