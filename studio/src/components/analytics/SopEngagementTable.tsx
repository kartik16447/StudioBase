import React, { useState } from 'react';

export interface SopRow {
  sopId: string;
  title: string;
  views: number;
  completionRate: number;
  avgDwellMs: number;
  problemStep: number | null;
}

interface Props {
  sops: SopRow[];
  selectedSopId: string | null;
  onSelect: (sopId: string) => void;
}

type SortKey = 'views' | 'completionRate' | 'avgDwellMs';

export const SopEngagementTable: React.FC<Props> = ({ sops, selectedSopId, onSelect }) => {
  const [sortKey, setSortKey] = useState<SortKey>('views');
  const sorted = [...sops].sort((a, b) => (b[sortKey] as number) - (a[sortKey] as number));

  const th = (label: string, key: SortKey) => (
    <th
      className={`px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest cursor-pointer select-none transition-colors ${sortKey === key ? 'text-primary' : 'text-text-3 hover:text-text-2'}`}
      onClick={() => setSortKey(key)}
    >
      {label} {sortKey === key ? '↓' : ''}
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 border-b border-border">
          <tr>
            <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-text-3">SOP</th>
            {th('Views', 'views')}
            {th('Completion', 'completionRate')}
            {th('Avg Dwell', 'avgDwellMs')}
            <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-text-3">Problem Step</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row.sopId}
              onClick={() => onSelect(row.sopId)}
              className={`border-b border-border cursor-pointer transition-colors ${selectedSopId === row.sopId ? 'bg-primary-light' : 'hover:bg-surface-2'}`}
            >
              <td className="px-4 py-3 font-medium text-[#1D1D1F] max-w-[200px] truncate">{row.title}</td>
              <td className="px-4 py-3 text-text-2 tabular-nums">{row.views.toLocaleString()}</td>
              <td className="px-4 py-3 tabular-nums">
                <span className={`font-semibold ${row.completionRate >= 0.7 ? 'text-green-600' : row.completionRate >= 0.4 ? 'text-yellow-600' : 'text-red-500'}`}>
                  {Math.round(row.completionRate * 100)}%
                </span>
              </td>
              <td className="px-4 py-3 text-text-2 tabular-nums">{(row.avgDwellMs / 1000).toFixed(1)}s</td>
              <td className="px-4 py-3">
                {row.problemStep != null
                  ? <span className="text-yellow-600 font-medium">Step {row.problemStep + 1} ⚠</span>
                  : <span className="text-text-3">—</span>}
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-10 text-center text-text-3">No data yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
