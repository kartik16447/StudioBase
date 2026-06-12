import { Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { recordEvent } from '../telemetry/events';
import { AppContext } from '../types/hono';

export type WorkspaceRole = 'Owner' | 'Admin' | 'Member' | 'Viewer';

export const RoleLevels: Record<WorkspaceRole, number> = {
  'Owner': 4,
  'Admin': 3,
  'Member': 2,
  'Viewer': 1
};

export interface WorkspaceContext {
  id: string;
  role: WorkspaceRole;
  membership: any;
}

/**
 * Workspace Middleware
 * Enforces explicit workspaceId, validates membership, and injects context.
 */
export const workspaceMiddleware = () => {
  return async (c: AppContext, next: Next) => {
    const user = c.get('user');
    if (!user) throw new HTTPException(401, { message: 'Authentication required' });

    // 1. Extract workspaceId — path param first, then URL regex fallback (c.req.param() may not
    //    resolve when middleware is invoked via factory chain before Hono binds route params),
    //    then query param, then header.
    // UUID-only regex — prevents path segments like "members", "settings", "invites"
    // from being mistaken for a workspaceId when sub-routes share the /workspaces prefix.
    const urlWorkspaceMatch = c.req.url.match(/\/workspaces\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    const workspaceId =
      c.req.param('workspaceId') ||
      urlWorkspaceMatch?.[1] ||
      c.req.query('workspaceId') ||
      c.req.header('x-workspace-id');

    if (!workspaceId) {
      recordEvent(c, { eventName: 'workspace.context_missing' }).catch(() => {});
      throw new HTTPException(400, { 
        message: 'Explicit workspace context required. Please provide workspaceId in query or x-workspace-id header.'
      });
    }

    // 2. Validate Membership & Role
    const membership = await c.env.DB.prepare(
      'SELECT workspaceId, role FROM workspace_members WHERE userId = ? AND workspaceId = ?'
    ).bind(user.id, workspaceId).first() as { workspaceId: string, role: string } | null;

    if (!membership) {
      console.warn(`⚠️ [GOVERNANCE] Unauthorized access attempt: User ${user.id} -> Workspace ${workspaceId}`);
      recordEvent(c, { 
        eventName: 'workspace.access_denied', 
        workspaceId,
        properties: { userId: user.id }
      }).catch(() => {});
      
      throw new HTTPException(403, { 
        message: 'You do not have access to this workspace.'
      });
    }

    // 3. Check session revocation (if owner called revoke-all-sessions)
    if (user.iat) {
      const revokeRow = await c.env.DB.prepare(
        'SELECT revokedBefore FROM workspace_settings WHERE workspaceId = ?'
      ).bind(workspaceId).first<{ revokedBefore: number | null }>().catch(() => null);

      if (revokeRow?.revokedBefore && user.iat * 1000 < revokeRow.revokedBefore) {
        throw new HTTPException(401, { message: 'SESSIONS_REVOKED' });
      }
    }

    // 4. Inject Workspace Context
    const wsContext: WorkspaceContext = {
      id: workspaceId,
      role: (membership.role.charAt(0).toUpperCase() + membership.role.slice(1).toLowerCase()) as WorkspaceRole,
      membership
    };

    c.set('workspace', wsContext);
    
    // Sync user context for telemetry convenience
    c.set('user', { ...user, workspaceId, role: wsContext.role });

    await next();
  };
};

import { Permission, hasPermission } from '../utils/permissions';

/**
 * PBAC Helper: Require a specific permission
 */
export const requirePermission = (requiredPermission: Permission) => {
  return async (c: AppContext, next: Next) => {
    const ws = c.get('workspace');
    if (!ws) throw new HTTPException(500, { message: 'Workspace context missing (requirePermission called before workspaceMiddleware)' });

    if (!hasPermission(ws.role, requiredPermission)) {
      throw new HTTPException(403, { 
        message: `Insufficient permissions. Missing: ${requiredPermission}`
      });
    }
    await next();
  };
};

