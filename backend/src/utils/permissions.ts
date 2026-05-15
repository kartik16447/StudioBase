export type Permission = 
  | 'session:read'
  | 'session:export'
  | 'sop:edit'
  | 'sop:publish'
  | 'member:invite'
  | 'workspace:admin';

export type Role = 'Owner' | 'Admin' | 'Member' | 'Viewer';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  Owner: ['session:read', 'session:export', 'sop:edit', 'sop:publish', 'member:invite', 'workspace:admin'],
  Admin: ['session:read', 'session:export', 'sop:edit', 'sop:publish', 'member:invite', 'workspace:admin'],
  Member: ['session:read', 'session:export', 'sop:edit', 'sop:publish'],
  Viewer: ['session:read']
};

export function hasPermission(role: string, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role as Role] || [];
  return permissions.includes(permission);
}
