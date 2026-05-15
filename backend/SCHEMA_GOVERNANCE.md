# Schema Governance Guide

## Standards for Schema Design

### 1. Naming Conventions
- **Tables**: Lowercase, plural, snake_case (e.g., `workspace_members`).
- **Columns**: Lowercase, singular, snake_case (e.g., `joined_at`).
- **IDs**: Use `TEXT` (UUIDs) for primary keys. Avoid auto-incrementing integers for distributed entities.

### 2. Constraints & Integrity
- **NOT NULL**: Apply `NOT NULL` to all required fields.
- **REFERENCES**: Explicitly define `REFERENCES` for all foreign keys to ensure D1 referential integrity.
- **ON DELETE**: Use `CASCADE` sparingly; prefer soft deletes (`deletedAt` timestamp).

### 3. Performance & Indexing
- Every foreign key column must have an index unless the table is extremely small (<1000 rows).
- Multi-column indexes should be used for common query patterns (e.g., `(workspaceId, createdAt)`).
- Prefix indexes with `idx_<table_name>_<column_name>`.

### 4. Enterprise RBAC Integrity
- Any table containing workspace-scoped data MUST have a `workspaceId` column.
- Access to these tables must be filtered via `workspaceMiddleware` or `WorkspaceService`.

### 5. Validation Checklist
Before committing a migration, verify:
- [ ] Table/Column names follow snake_case.
- [ ] Foreign keys are correctly referenced.
- [ ] Necessary indexes are added.
- [ ] Checksums will be unique.
- [ ] Migration is downward compatible (if possible) to avoid downtime during deployment.
