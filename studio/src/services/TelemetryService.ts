import { apiClient } from '../lib/apiClient';

export const TelemetryService = {
  async record(event: {
    eventName: string;
    workspaceId?: string;
    sessionId?: string;
    properties?: Record<string, any>;
  }) {
    try {
      await apiClient.post('/telemetry', event);
    } catch (err) {
      console.warn('[TelemetryService] Failed to record event:', err);
    }
  }
};
