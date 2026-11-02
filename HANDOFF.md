# Foyr Screen Recorder (ScreenVault) — Complete Handoff

Written 2026-11-02. Read this top to bottom on the new laptop. It supersedes
`DEPLOYMENT_RULES.md`, which is stale (old personal account, old player Worker).

## 1. What this product is

A Chrome extension records the screen, uploads the video to Cloudflare R2, and
returns a share link. A web app lets people sign in, browse the library, upload
files, and watch shared videos.

```
Chrome extension ──(Google OAuth token)──> Backend Worker ──> D1 (metadata) + KV (token cache)
       │                                         │
       └──(8MB multipart chunks via backend)─────┴──> R2 bucket screenvault-videos

Viewer opens  recorder.foyr.com/watch/?id=<8-char shortId>
   watch page (static, in the web app) ──> Proxy Worker  ──> D1 lookup shortId ──> R2 stream
Dashboard     recorder.foyr.com/library   (React SPA) ──> Backend Worker
```

## 2. Where the code lives

- **GitHub:** `https://github.com/kartik16447/StudioBase` (repo name is StudioBase, local folder is `Screnvaultmaster`)
- **Working branch: `r2-migration`.** `main` on GitHub is OLD (pre-R2) and does not contain this work.
  Make sure `r2-migration` is pushed before relying on GitHub (see section 10).
- Local path on the old laptop: `~/Downloads/Screnvaultmaster`

| Folder | What it is | Deploys to |
|---|---|---|
| `screenvault-backend/` | API Worker (`src/index.ts`), D1 migrations, `schema.sql` | Worker `screenvault-backend` |
| `screenvault-extension/` | Chrome extension source (`src/`), build script `build.mjs`, manifest | Chrome Web Store (zip) |
| `screenvault-extension/worker/` | Proxy / streaming Worker (`index.ts`, own `wrangler.jsonc`) | Worker `screenvault-proxy` |
| `screenvault-web/` | Dashboard (React + Vite) AND the player page | Cloudflare Pages `screenvault-web` |
| `screenvault-web/public/watch/` | The player page: static HTML/JS/CSS, served at `/watch/` | (part of the Pages deploy) |
| `screenvault-web/public/privacy/` | Static privacy page for Chrome Web Store review | (part of the Pages deploy) |
| `screenvault-landing/` | Old standalone marketing page. NOT deployed, stale. Ignore. | nothing |
| `screenvault-extension/wrangler.jsonc` | Config of the OLD player Worker `screenvault` (obsolete, replaced by `/watch`) | don't use |
| `docs/` | Chrome Web Store plan + older stage reports | — |

The **player lives in `screenvault-web/public/watch/index.html`** (it used to be inside the extension).

## 3. Live infrastructure (Cloudflare account: "Tushar@foyr.com's Account")

- Account ID: `abf33e261292708deb1035215909f81f`
- Workers subdomain: `tushar-abf.workers.dev`
- Backend: `https://screenvault-backend.tushar-abf.workers.dev`
- Proxy: `https://screenvault-proxy.tushar-abf.workers.dev`
- Web + player (Pages project `screenvault-web`): `recorder.foyr.com` and `screenvault-web-7r9.pages.dev`
  - Player URL pattern: `https://recorder.foyr.com/watch/?id=<shortId>`
- D1 database `screenvault-db`: `a316da5a-2f9b-4a4a-9320-93333036328c`
- KV `TOKEN_CACHE`: `e7e8d85c637d4e67aa81cf3b2261c921`
- R2 bucket: `screenvault-videos`
- Backend cron: `0 0 * * *` (daily)
- Secret `ENCRYPTION_KEY` on BOTH backend and proxy Workers. **They must be identical.** Old links with long encrypted ids need it. It is not in git — if it's lost, new shortId links still work but legacy long links break.
- `ADMIN_EMAIL` is read by the backend (admin endpoints); check it's set in the Worker's dashboard settings.
- The old personal Cloudflare account (`karthik.upadhyay98@gmail.com`) is a fallback and is not used any more.

### Google OAuth
- Client ID: `219621491181-6spsdkmasuh1nf534s4371shlgtlf8ek.apps.googleusercontent.com` (GCP project `techtraining1`, type External)
- Scopes: userinfo.email, userinfo.profile only
- Authorized JS origins: `https://recorder.foyr.com` (and the pages.dev URL)
- Authorized redirect URIs: `https://<extension-id>.chromiumapp.org/` for the Web Store ID `ejaghjlljgimabjjfmkcopcaphaedldg`, plus the random ID of any unpacked copy (the error message `redirect_uri_mismatch` shows the exact one).

### Chrome Web Store
- Item "Foyr Screen Recorder", extension ID `ejaghjlljgimabjjfmkcopcaphaedldg`, version in `manifest.json` (currently 1.0.1)
- Developer account: the new company account (see `docs/chrome-webstore-new-account-migration.md` for history, rejections and listing text)

## 4. Setting up the new laptop

```bash
# tools: Node 20+, git, gh
npm i -g wrangler          # or use npx wrangler everywhere
wrangler login             # sign in as kartik.upadhyay@foyr.com
gh auth login

git clone https://github.com/kartik16447/StudioBase.git
cd StudioBase
git checkout r2-migration

(cd screenvault-backend && npm install)
(cd screenvault-extension && npm install)
(cd screenvault-web && npm install)
```

**Important: this login can see TWO Cloudflare accounts** (the company one and `Kartik.upadhyay@foyr.com's Account`, id `d0074afb…`). Always pin the right one, on every command:

```bash
export CLOUDFLARE_ACCOUNT_ID=abf33e261292708deb1035215909f81f
```

(Set it in the same shell as the command; it does not persist between separate tool calls.)

Files that are NOT in git and must be copied by hand if you need them:
- `screenvault-extension/key.pem` — private key matching the manifest `key`. Only matters for an unpacked copy that keeps a fixed ID. The Web Store ID doesn't depend on it.
- `*.zip` / `*.crx` build artifacts (gitignored; rebuild them).
- `ENCRYPTION_KEY` value (secret; keep it from the old laptop's password manager, or re-set the same value on both Workers).

## 5. Deploy commands, by component

Run the backend first when a change touches both the backend and the web app.

### Backend API
```bash
cd screenvault-backend
export CLOUDFLARE_ACCOUNT_ID=abf33e261292708deb1035215909f81f
npx tsc --noEmit                      # typecheck
npx wrangler deploy                   # = npm run deploy
```
After changing bindings in `wrangler.jsonc`: `npx wrangler types`.

### Database migrations (D1)
```bash
cd screenvault-backend
npx wrangler d1 migrations list DB --remote      # what is pending
npx wrangler d1 migrations apply DB --remote
npx wrangler d1 execute DB --remote --command "SELECT count(*) FROM videos"
```
Migrations are in `screenvault-backend/migrations/` (0001–0021). If one fails with
"duplicate column name", the column already exists; insert its name into the
`d1_migrations` table to mark it applied.

### Proxy / streaming Worker (also serves `/meta`, `/event`)
```bash
cd screenvault-extension/worker
npx wrangler deploy
```
Needed whenever `worker/index.ts` changes. It shares the D1 and R2 bindings.

### Web dashboard + player page (`recorder.foyr.com`)
```bash
cd screenvault-web
npm run build                         # tsc + vite build -> dist/
npx wrangler pages deploy dist --project-name=screenvault-web --branch=main
```
**`--branch=main` is required.** Without it Pages publishes a preview deployment for your current git branch (`r2-migration`), not production, and you won't notice.
Both the dashboard and `/watch/` + `/privacy/` ship in this one deploy (`public/` is copied verbatim).
Don't create the Pages project from the CLI (`wrangler pages project create` ignores the account id); it already exists and has `recorder.foyr.com` attached.

### Chrome extension
```bash
cd screenvault-extension
npm run build                         # esbuild -> dist/
```
- **Test locally:** `chrome://extensions` → Developer mode → Load unpacked → pick `screenvault-extension/dist`. After each rebuild click Reload there. Sign-in on an unpacked copy needs its random ID added as an OAuth redirect URI.
- **Release:** bump `version` in `manifest.json`, run the build, zip the CONTENTS of `dist/` (so `manifest.json` is at the zip root), then upload at the Chrome Web Store Developer Dashboard → the item → Package → Upload new package → submit for review.
  ```bash
  cd screenvault-extension/dist && zip -r ../foyr-screen-recorder-<version>.zip .
  ```
- `build.mjs` strips `key` from the manifest and sets the app name (`APP_NAME`).
- Constants that point at the live system: `BACKEND_URL` and `PLAYER_BASE_URL` at the top of `src/service-worker.ts` and `src/offscreen.ts`; `host_permissions` in `manifest.json`.
- Store rules to remember: no remote `<script src>` or CDN fonts anywhere in the zip (MV3); the privacy-policy URL must show real text in the raw HTML (it does: `/privacy/`).

## 6. What each change needs deployed

| You changed | Deploy |
|---|---|
| `screenvault-backend/src/**` | backend |
| `screenvault-backend/migrations/**` | `d1 migrations apply --remote`, then backend |
| `screenvault-extension/worker/index.ts` | proxy Worker |
| `screenvault-web/src/**` (dashboard) | web Pages deploy |
| `screenvault-web/public/watch/**` (player) | web Pages deploy |
| `screenvault-extension/src/**`, `manifest.json` | extension build, reload unpacked / new Web Store version |
| Several of the above | backend → proxy → web → extension |

Smoke test after deploying:
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://recorder.foyr.com/watch/?id=INVALID     # page loads (200)
curl -s "https://screenvault-proxy.tushar-abf.workers.dev/meta?id=<a real shortId>"       # JSON with name/contentType
curl -s -X POST https://screenvault-backend.tushar-abf.workers.dev/videos/x/download-link # "Missing Authorization header"
```

## 7. How the main flows work (so you know where to look)

- **Recording:** `popup.ts` → `service-worker.ts` pre-allocates an R2 multipart upload (`POST /uploads/init`) and a video row (`POST /videos`) so a share link exists immediately; `offscreen.ts` records with MediaRecorder in 1s chunks and uploads parts (`PUT /uploads/part`) while recording; stop → `POST /uploads/complete` → `PATCH /videos/:id` (status ready, size, duration).
- **Share link:** each video has an 8-char random `shortId`; the proxy resolves it from D1. Legacy ids (33-char raw, 50+ char encrypted) still work.
- **Dashboard uploads:** `screenvault-web/src/upload.ts` does the same multipart flow from the browser. Per-file limit is **2GB** (`MAX_UPLOAD_BYTES` in `upload.ts`, `MAX_FILE_BYTES` in `backend/src/index.ts` — change both). There is no per-user storage cap. Audio, video and image types are accepted; folders mirror into library folders.
- **Downloads:** `POST /videos/:id/download-link` (owner only) returns an HMAC-signed 5-minute URL to `GET /download`, which streams the original R2 object.
- **Logs and metrics:** the extension posts to `POST /logs` (table `debug_logs`); playback events go to `metrics_events`. Useful for debugging:
  ```bash
  npx wrangler d1 execute DB --remote --command "SELECT tag,timestamp FROM debug_logs ORDER BY id DESC LIMIT 20"
  ```

## 8. Known gotchas

- Pin `CLOUDFLARE_ACCOUNT_ID` (two accounts on one login).
- `wrangler pages deploy` needs `--branch=main` for production.
- R2 must be enabled per account (billing-gated) — already done on the company account.
- Re-applying old D1 migrations to a fresh database gives expected "duplicate column" errors; safe to skip.
- The extension has no `playback.ts` / dashboard any more; the share link opens the web app's `/watch/` page.
- 511 old videos sit in status `uploading` (never finalized); harmless, cleanup optional.
- `tsc` in `screenvault-extension/node_modules` was broken on the old laptop; a fresh `npm install` should fix it.

## 9. Not done / deferred

- Chrome Web Store resubmission status: check the Developer Dashboard (rejected twice earlier; fixes are in the repo, see `docs/chrome-webstore-new-account-migration.md`).
- `screenvault-landing` marketing page never deployed.
- `POST /admin/backfill-short-ids` exists to give old videos a shortId in bulk; never run.
- OAuth consent screen is External; could be limited to `@foyr.com`.
- Encryption key derivation uses zero-padding, not a KDF (not exploitable with the current full-entropy key).

## 10. First thing to do: get the code onto GitHub

As of this writing the work is committed locally on `r2-migration` (39 commits ahead of
GitHub `main`, branch not pushed). On the OLD laptop:

```bash
git push -u origin r2-migration
```

Optionally open a PR into `main` so `main` becomes the real source of truth.
