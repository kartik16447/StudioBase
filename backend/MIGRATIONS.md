# Migration Governance Guide

## Overview
StudioBase uses a formalized migration workflow to ensure schema stability across local, staging, and production environments.

## Directory Structure
- `backend/migrations/`: Contains SQL migration files.
- `backend/scripts/migrate.ts`: Custom migration runner with checksum validation.

## Naming Convention
Files must follow the pattern `XXXX_description.sql`:
- `0001_initial.sql`
- `0002_enterprise_foundation.sql`
- `0003_migration_governance.sql`

## Checksum Validation
The migration runner calculates a SHA-256 checksum for every file. 
**IMPORTANT**: Once a migration is committed and applied to any environment, it MUST NOT be modified. If changes are needed, create a NEW migration.

## Execution
### Local Development
```bash
npm run migrate:local
```

### Production (Remote)
```bash
npm run migrate:remote
```

## Rollback Strategy
1. **Manual Rollback**: Create a new migration file that reverts the changes (e.g., `0005_rollback_0004.sql`).
2. **Point-in-Time Recovery**: Use Cloudflare D1's built-in backup and restore features via Wrangler.
   ```bash
   wrangler d1 backups list <database>
   wrangler d1 backups restore <database> <backup-id>
   ```

## Best Practices
- **Atomic Migrations**: Keep migrations small and focused.
- **No Data Mutation**: Avoid complex data migrations in schema files; use dedicated scripts if needed.
- **Foreign Keys**: Always define foreign key constraints for referential integrity.
- **Indexes**: Add indexes for any column used in `WHERE`, `JOIN`, or `ORDER BY` clauses.
