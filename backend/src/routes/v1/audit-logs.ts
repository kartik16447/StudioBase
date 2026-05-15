import { Hono } from 'hono';
import { Env, Variables } from '../../types/hono';
import { authMiddleware } from '../../middlewares/auth';
import { workspaceMiddleware, requirePermission } from '../../middlewares/workspace';
import { AuditLogController } from '../../controllers/AuditLogController';

const auditLogs = new Hono<{ Bindings: Env; Variables: Variables }>();

auditLogs.use('*', authMiddleware(), workspaceMiddleware(), requirePermission('workspace:admin'));

auditLogs.get('/', AuditLogController.list);

export default auditLogs;
