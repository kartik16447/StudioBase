# SOC 2 Controls Mapping

Maps each control to the code that implements it. Use this as the evidence index for an audit.

| Control | ID | Implementation | File(s) |
|---|---|---|---|
| Access Control Policy | AC-1 | Role-based workspace access enforced on every request via `workspaceMiddleware` + `requirePermission` | `middlewares/workspace.ts` |
| Account Management | AC-2 | Users auto-provisioned on first Google OAuth sign-in; stored in `users` table; workspace membership in `workspace_members` | `services/AuthService.ts`, `routes/v1/auth.ts` |
| Least Privilege | AC-6 | Permission bit-field (`permissions` column on `workspace_members`) checked before every privileged action; defaults to minimum | `middlewares/workspace.ts`, `utils/permissions.ts` |
| Session Management | AC-12 | JWT sessions with configurable expiry; revocable via `workspace_members.revokedAt` | `middlewares/auth.ts`, `services/AuthService.ts` |
| Audit Logging | AU-2 | All privileged actions emit a row to `audit_logs` via `AuditService`; extension events sent to `/v1/audit-logs` | `services/AuditService.ts`, `telemetry/audit.ts` |
| Audit Log Protection | AU-9 | Logs written to D1 (append-only in practice); export writes immutable JSONL to R2 with 15-min signed URL | `routes/v1/audit-logs.ts` (export handler) |
| Audit Log Export | AU-11 | `GET /v1/audit-logs/export?from=&to=` (admin only) streams range to R2, records `audit_log.exported` event | `routes/v1/audit-logs.ts` |
| SSO / Federation | IA-2 | Google OAuth 2.0 via GSI; `id_token` verified server-side with Google's JWKS endpoint | `services/AuthService.ts` |
| SAML SSO | IA-2 (enterprise) | SAML 2.0 SP-initiated flow in `SsoController`; assertions verified before provisioning | `controllers/SsoController.ts`, `routes/v1/sso.ts` |
| Data Encryption in Transit | SC-8 | All endpoints served over HTTPS via Cloudflare; HSTS enforced at edge | Cloudflare Workers / DNS |
| Data Encryption at Rest | SC-28 | D1 encrypted at rest by Cloudflare; R2 objects server-side encrypted (AES-256) | Cloudflare platform |
| Data Retention | SI-12 | `retentionDays` per workspace; scheduled worker soft-deletes sessions + purges R2 assets; emits `retention.purge` audit event | `handlers/scheduled.ts`, `migrations/0010_billing_primitives.sql` |
| Feature / Plan Gating | CM-7 | `planGate` middleware enforces seat and export limits per plan tier (free / pro / enterprise); returns 402 with structured error | `middlewares/plan.ts` |
| Vulnerability Management | SI-2 | Dependencies pinned; Dependabot alerts wired to repo; Sentry error tracking in production | `package.json`, Sentry integration in `index.ts` |
| Incident Response | IR-4 | Sentry captures unhandled exceptions with workspace/user context; `audit_logs` provide post-incident timeline | `middlewares/error.ts`, Sentry |

## Generating Evidence

```bash
# Export all audit logs for a time range (admin token required)
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "x-workspace-id: $WORKSPACE_ID" \
     "https://api.studiobase.app/v1/audit-logs/export?from=1700000000000&to=1799999999999"
# Response: { url: "<signed R2 URL>", rows: N, key: "exports/audit/..." }
```

The signed URL is valid for 15 minutes and points to a JSONL file in R2 — one JSON object per line, each audit event.
