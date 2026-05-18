import React, { useEffect, useState } from 'react';
import { apiClient } from '../lib/apiClient';
import { WorkspaceSummary } from '../components/analytics/WorkspaceSummary';
import { SopEngagementTable } from '../components/analytics/SopEngagementTable';
import type { SopRow } from '../components/analytics/SopEngagementTable';
import { StepHeatmap } from '../components/analytics/StepHeatmap';
import type { StepData } from '../components/analytics/StepHeatmap';

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
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSelectSop = async (sopId: string) => {
    setSelectedSopId(sopId);
    setDetailLoading(true);
    try {
      const data = await apiClient.get<SopAnalytics>(`/analytics/sops/${sopId}`);
      setSopDetail(data);
    } catch {
      setSopDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const avgCompletionRate = workspace
    ? workspace.sops.length > 0
      ? workspace.sops.reduce((s, r) => s + r.completionRate, 0) / workspace.sops.length
      : 0
    : 0;

  const topSop = workspace?.sops[0]?.title ?? null;

  const selectedSopTitle = workspace?.sops.find((s) => s.sopId === selectedSopId)?.title ?? '';

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-8 space-y-8 bg-bg scroll-y">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1D1D1F]">Workspace Analytics</h1>
          <p className="text-text-3 text-sm mt-1">Last 30 days · SOP engagement & completion</p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24 text-text-3">Loading analytics…</div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-red-600 text-sm">
          {error.includes('403') ? 'Admin access required to view workspace analytics.' : error}
        </div>
      )}

      {workspace && !loading && (
        <>
          <WorkspaceSummary
            totalViews={workspace.totalViews}
            avgCompletionRate={avgCompletionRate}
            topSopTitle={topSop}
            totalSessions={workspace.totalSessions}
          />

          <div>
            <div className="text-[11px] font-bold text-text-3 uppercase tracking-widest mb-3">SOPs by Engagement</div>
            <SopEngagementTable
              sops={workspace.sops}
              selectedSopId={selectedSopId}
              onSelect={handleSelectSop}
            />
          </div>

          {selectedSopId && (
            <div>
              {detailLoading && (
                <div className="text-text-3 text-sm py-4">Loading step breakdown…</div>
              )}
              {sopDetail && !detailLoading && (
                <StepHeatmap steps={sopDetail.steps} sopTitle={selectedSopTitle} />
              )}
            </div>
          )}

          {workspace.sops.length === 0 && (
            <div className="text-center py-20 text-text-3 bg-white rounded-xl border border-border">
              <p className="text-lg font-medium text-text-2 mb-2">No analytics data yet</p>
              <p className="text-sm">Events will appear here once viewers start watching your SOPs.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};
