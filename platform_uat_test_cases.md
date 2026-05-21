# StudioBase Phase 0-4.6: User Acceptance Testing (UAT) Guide

This guide provides a structured set of test cases to verify the integrity and functionality of the StudioBase platform following the completion of Phase 4.6 (Extension Compliance Sync).

## 1. Governance & Data Residency (Phase 4)
| Test Case ID | Feature | Action | Expected Result |
| :--- | :--- | :--- | :--- |
| GOV-01 | Workspace Settings View | Navigate to `Workspace Settings` in the sidebar. | Should display SSO status, Data Region, and Retention days as read-only fields. |
| GOV-02 | Member Role Visibility | View the `Members` list in Settings. | Every member should have a visible role badge (Owner, Admin, Member, etc.) and "Invited by" attribution. |
| GOV-03 | Database Integrity | Check recent sessions or create a new workspace. | Verify `workspace_settings` record is initialized with defaults (Global, 90 days). |

## 2. Policy-Based Access Control (PBAC) (Phase 4)
| Test Case ID | Feature | Action | Expected Result |
| :--- | :--- | :--- | :--- |
| SEC-01 | Admin Only Access | Login as a `Member` (not Admin) and try to click `Audit Logs`. | Should show a "Permission Denied" toast notification. |
| SEC-02 | Global Error Interceptor | Log out or delete `sb_token` from localStorage, then refresh. | Should trigger a redirect to login or show an "Unauthorized" toast. |
| SEC-03 | Permission Consistency | Attempt to delete a session as a `Viewer`. | UI should block the action OR API should return 403 and trigger a toast. |

## 3. Pipeline & Export Feedback (Phase 2 & 4.5)
| Test Case ID | Feature | Action | Expected Result |
| :--- | :--- | :--- | :--- |
| PIP-01 | Session Status Badge | View the Library (`HomePage`). | Each session card should have a status badge (READY, PROCESSING, QUEUED, or FAILED). |
| PIP-02 | Export Download | Find a session with a `READY` status and R2 key. | Click the `Download` button. Should open/download the file from `/v1/assets/:key`. |
| PIP-03 | Pipeline Retry | Find a session with a `FAILED` status. | Click `Retry`. Status should update to `QUEUED` and call `/pipeline/trigger`. |
| PIP-04 | Error Surface | Hover over or view a `FAILED` session's error text. | Should see the specific `errorReason` from the backend. |

## 4. Audit & Diagnostics (Phase 4.5)
| Test Case ID | Feature | Action | Expected Result |
| :--- | :--- | :--- | :--- |
| AUD-01 | Audit Log Table | Navigate to `/workspace/audit-logs`. | Table should show timestamp, actor, action, and target ID. |
| AUD-02 | Audit Filters | Apply a `Start Date` filter. | Table should reload with filtered results from the backend. |
| AUD-03 | Audit Pagination | Click `Next` on a long list of logs. | Should fetch the next page using `offset` query param. |
| DIA-01 | Diagnostics Dashboard | Navigate to `/admin/diagnostics` (Ensure `VITE_DEV_MODE=true`). | Should see Usage Metrics (Storage, Sessions) and a list of pipeline statuses. |

## 5. Renderer Abstraction (Phase 3)
| Test Case ID | Feature | Action | Expected Result |
| :--- | :--- | :--- | :--- |
| REN-01 | Headless Integrity | Open a session in the Studio editor. | Frames should render perfectly using the decoupled `RenderSpec` architecture. |
| REN-02 | Serializable Contract | Check dev console during playback. | No DOM element warnings should appear in the rendering pipeline logic. |

## 6. Extension Compliance Sync (Phase 4.6)
| Test Case ID | Feature | Action | Expected Result |
| :--- | :--- | :--- | :--- |
| EXT-01 | Extension Versioning | Perform a test recording using the Chrome Extension. | Check network requests: all backend calls must hit `/v1/` routes. |
| EXT-02 | Telemetry Trigger | Start and stop an extension recording. | Backend `audit_logs` should register `session.capture_started` and `session.capture_completed`. |
| EXT-03 | Workspace Context | Inspect any extension network call to the backend. | Must include `x-workspace-id` and `Authorization: Bearer` headers. |
| EXT-04 | Pipeline Activation | Stop a recording and wait for finalization. | Extension popup should show `Starting pipeline...` and status must transition to `queued` in the DB. |
| EXT-05 | Dead Code Absence | Build the extension via `npm run build`. | Should build successfully with zero errors related to `utils/api`, `screenvault`, or `playback`. |

---

### **Pass/Fail Criteria**
- **CRITICAL**: If any SEC-xx or EXT-03 test fails, do not proceed to Phase 5.
- **MAJOR**: If PIP-01, PIP-02, or EXT-04 fails, the export pipeline is broken.
- **MINOR**: UI alignment issues in the Audit table.

**PHASE 4.6 IS FORMALLY CLOSED AND GOVERNANCE IS ENFORCED.**
