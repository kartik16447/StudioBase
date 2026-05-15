import { z } from 'zod';

export const UpdateWorkspaceSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').max(100).optional(),
  brandConfig: z.record(z.string(), z.any()).optional(),
});

export const CreateInviteSchema = z.object({
  workspaceId: z.string().uuid(),
  role: z.enum(['Owner', 'Admin', 'Member', 'Viewer']).default('Member'),
});

export const JoinWorkspaceSchema = z.object({
  token: z.string().min(1, 'Invite token is required'),
});

export const LeaveWorkspaceSchema = z.object({
  workspaceId: z.string().uuid(),
});

export const RevokeInviteSchema = z.object({
  inviteId: z.string().uuid(),
});

export const WorkspaceSettingsSchema = z.object({
  ssoEnabled: z.number().int().min(0).max(1).default(0),
  ssoProvider: z.string().optional(),
  samlConfig: z.string().optional(),
  allowedDomains: z.string().optional(),
  dataRegion: z.string().default('global'),
  retentionDays: z.number().int().min(1).default(90),
});
