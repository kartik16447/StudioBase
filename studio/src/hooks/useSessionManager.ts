import { useEffect } from 'react';
import { useStudioStore } from '../store/useStudioStore';
import { RenderConstants } from '../modules/render-engine/RenderConstants';
import { ThemeService } from '../services/ThemeService';

export function useSessionManager() {
  const fetchSession = useStudioStore(state => state.fetchSession);
  const brand = useStudioStore(state => state.brand);

  // Theme Management
  useEffect(() => {
    ThemeService.applyBrand(brand);
  }, [brand?.primaryColor, brand?.font]);

  // Initial Fetch
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session');
    console.log('[StudioPage] Initial mount, sessionId:', sessionId);
    if (sessionId) {
      fetchSession(sessionId);
    }
  }, [fetchSession]);

  // Background Asset Refresh (Keep signed URLs alive)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session');
    if (!sessionId) return;
    
    // Refresh tokens every 15 minutes
    const interval = setInterval(() => {
      console.log('🔄 [StudioPage] Refreshing assets...');
      fetchSession(sessionId);
    }, RenderConstants.ASSET_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchSession]);
}
