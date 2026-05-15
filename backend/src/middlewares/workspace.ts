import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { recordEvent, Events } from '../telemetry/events';

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
  return async (c: Context, next: Next) => {
    const user = c.get('user');
    if (!user) throw new HTTPException(401, { message: 'Authentication required' });

    // 1. Extract workspaceId from multiple possible sources
    const workspaceId = 
      c.req.query('workspaceId') || 
      c.req.header('x-workspace-id') || 
      (await tryGetWorkspaceIdFromSession(c));

    if (!workspaceId) {
      recordEvent(c, { eventName: 'workspace.context_missing' }).catch(() => {});
      throw new HTTPException(400, { 
        message: 'Explicit workspace context required. Please provide workspaceId in query or x-workspace-id header.',
        code: 'WORKSPACE_CONTEXT_MISSING'
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
        message: 'You do not have access to this workspace.',
        code: 'WORKSPACE_ACCESS_DENIED'
      });
    }

    // 3. Inject Workspace Context
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

/**
 * RBAC Helper: Require a minimum role level
 */
export const requireRole = (minRole: WorkspaceRole) => {
  return async (c: Context, next: Next) => {
    const ws = c.get('workspace') as WorkspaceContext;
    if (!ws) throw new HTTPException(500, { message: 'Workspace context missing (requireRole called before workspaceMiddleware)' });

    if (RoleLevels[ws.role] < RoleLevels[minRole]) {
      throw new HTTPException(403, { 
        message: `Insufficient permissions. Required: ${minRole}, You are: ${ws.role}`,
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }
    await next();
  };
};

/**
 * RBAC Helper: Require exact role matches
 */
export const requireExactRoles = (allowedRoles: WorkspaceRole[]) => {
  return async (c: Context, next: Next) => {
    const ws = c.get('workspace') as WorkspaceContext;
    if (!ws) throw new HTTPException(500, { message: 'Workspace context missing' });

    if (!allowedRoles.includes(ws.role)) {
      throw new HTTPException(403, { 
        message: `Insufficient permissions. Allowed: ${allowedRoles.join(', ')}`,
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }
    await next();
  };
};

/**
 * Heuristic: If we're looking at a session, we can infer the workspaceId
 */
async function tryGetWorkspaceIdFromSession(c: Context): Promise<string | null> {
  const path = c.req.path;
  const match = path.match(/\/sessions\/([^\/]+)/);
  if (!match) return null;

  const sessionId = match[1];
  // Simple check to avoid SQL if it's not a UUID
  if (sessionId.length < 32) return null;

  const result = await c.env.DB.prepare(
    'SELECT workspaceId FROM sessions WHERE id = ?'
  ).bind(sessionId).first() as { workspaceId: string } | null;

  return result?.workspaceId || null;
}
