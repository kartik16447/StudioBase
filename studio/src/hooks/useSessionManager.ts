import { useEffect } from 'react';
import { useStudioStore } from '../store/useStudioStore';
import { RenderConstants } from '../modules/render-engine/RenderConstants';
import { ThemeService } from '../services/ThemeService';

export function useSessionManager() {
  const fetchSession = useStudioStore(state => state.fetchSession);
  const brand = useStudioStore(state => state.brand);

  // 1. Theme Management
  useEffect(() => {
    ThemeService.applyBrand(brand);
  }, [brand?.primaryColor, brand?.font]);

  // 2. Initial Fetch
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session');

    if (sessionId) {
      console.log('[SessionManager] Initializing session:', sessionId);
      fetchSession(sessionId);
    }
  }, [fetchSession]);

  // 3. Background Asset Refresh (Keep signed URLs alive)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session');
    if (!sessionId) return;
    
    const interval = setInterval(() => {
      console.log('🔄 [SessionManager] Refreshing assets...');
      fetchSession(sessionId);
    }, RenderConstants.ASSET_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchSession]);
}
