# API Stability & Versioning Policy

## Stability Guarantee

All routes under `/v1` are **stable**. We do not make breaking changes without a 90-day deprecation notice.

A breaking change is any of:
- Removing or renaming a field in a response body
- Changing the type of an existing field
- Removing or renaming a route
- Changing the HTTP method of a route
- Tightening authentication/authorization requirements on an existing route

Adding new optional request fields or new response fields is **not** a breaking change.

## Versioning

| Version | Status | Notes |
|---|---|---|
| `/v1` | **Stable** | Current production version |
| `/v2` | Planned | Reserved for the next breaking-change cycle |

New features are introduced additively in `/v1`. When a breaking change is unavoidable, it ships in `/v2` and `/v1` runs in parallel until the sunset date.

## Deprecation Process

1. The deprecated endpoint is marked with response headers:
   ```
   Deprecation: true
   Sunset: Sat, 31 Dec 2026 00:00:00 GMT
   Link: <https://docs.studiobase.app/api/v2/migration>; rel="successor-version"
   ```
2. A 90-day notice period starts from the date the `Deprecation` header first appears.
3. After the sunset date the endpoint returns `410 Gone`.

## Rate Limits

| Tier | Limit |
|---|---|
| Free | 300 req/min per workspace |
| Pro | 600 req/min per workspace |
| Enterprise | 1 000 req/min per workspace (custom on request) |

Rate limit headers are returned on every response:
```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 247
X-RateLimit-Reset: 1700000060
```

Enforcement is planned for Phase 10. Until then, limits are documented but not enforced.

When a limit is exceeded, the API returns:
```json
HTTP 429 Too Many Requests
{ "error": "RATE_LIMIT_EXCEEDED", "retryAfter": 12 }
```

## Authentication

All `/v1` routes (except `/v1/auth/*` and `/health`) require:
```
Authorization: Bearer <jwt>
x-workspace-id: <workspaceId>
```

JWTs are issued by `POST /v1/auth/google` and `POST /v1/auth/refresh`. Default expiry is 7 days.

## Error Format

All errors follow a consistent shape:
```json
{
  "error": "HUMAN_READABLE_CODE",
  "message": "Optional longer description"
}
```

Plan-limit errors additionally include:
```json
{
  "error": "PLAN_LIMIT",
  "feature": "export" | "seat",
  "current": 10,
  "limit": 10,
  "plan": "free"
}
```
