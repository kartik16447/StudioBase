import { z } from 'zod';

export const UpdateWorkspaceSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').max(100).optional(),
  brandConfig: z.record(z.any()).optional(),
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
