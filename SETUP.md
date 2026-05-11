# StudioBase — Setup Guide

## Prerequisites

- Node.js 18+
- Wrangler CLI: `npm install -g wrangler`
- Logged into Cloudflare: `wrangler login`
- GitHub account

---

## Step 1 — Push to GitHub

Create a new **private** repo named `studiobase` on github.com (no README, no .gitignore).

Then run:

```bash
cd /Users/kartikupadhyay/Downloads/studiobase
git add .
git commit -m "Phase 0: base architecture"
git remote add origin https://github.com/kartik16447/studiobase.git
git push -u origin main
```

---

## Step 2 — Cloudflare: Create D1 Database

```bash
cd backend
npm install
wrangler d1 create studiobase-db
```

Copy the `database_id` from the output. Replace `REPLACE_WITH_NEW_D1_ID` in `wrangler.jsonc`.

Run the migration:

```bash
wrangler d1 execute studiobase-db --file=migrations/0001_initial.sql
```

---

## Step 3 — Cloudflare: Create KV Namespace

```bash
wrangler kv namespace create TOKEN_CACHE
```

Copy the `id` from output. Replace `REPLACE_WITH_NEW_KV_ID` in `wrangler.jsonc`.

---

## Step 4 — Cloudflare: Create R2 Bucket

```bash
wrangler r2 bucket create studiobase-assets
wrangler r2 bucket create studiobase-assets-preview
```

No ID to copy — the bucket name in `wrangler.jsonc` is already correct.

---

## Step 5 — Cloudflare: Create Queue

```bash
wrangler queues create studiobase-pipeline
```

---

## Step 6 — Set Secrets

```bash
wrangler secret put ADMIN_EMAIL
# enter: karthik.upadhyay98@gmail.com

wrangler secret put ENCRYPTION_KEY
# enter: any random 32-char string e.g. openssl rand -hex 16
```

OpenAI key (needed for Phase 3, can skip for now):

```bash
wrangler secret put OPENAI_API_KEY
# enter your OpenAI API key
```

---

## Step 7 — Deploy Backend

```bash
wrangler deploy
```

Note the worker URL from output (e.g. `https://studiobase-backend.your-subdomain.workers.dev`).
Update `shared/constants/index.ts` → `BACKEND_URL` with this URL.

---

## Step 8 — Verify Backend is Live

```bash
curl https://studiobase-backend.your-subdomain.workers.dev/admin \
  -H "Authorization: Bearer test"
# Should return 401 — means the worker is live
```

---

## Step 9 — Extension: Install Dependencies

```bash
cd ../extension
npm install
```

Remove the Supabase dependency (not used in new product):

```bash
npm uninstall @supabase/supabase-js
```

---

## Step 10 — Verify Directory Structure

After setup your repo should look like:

```
studiobase/
├── PHASES.md
├── SETUP.md
├── shared/
│   ├── types/
│   │   └── session.ts          ← canonical schema, never break this
│   └── constants/
│       └── index.ts
├── backend/
│   ├── wrangler.jsonc           ← D1 + KV + R2 + Queue configured
│   ├── migrations/
│   │   └── 0001_initial.sql    ← run this once via wrangler d1 execute
│   └── src/
│       └── index.ts            ← full backend API, no Drive code
└── extension/
    ├── manifest.json            ← no Drive scopes, content_scripts added
    ├── src/
    │   ├── capture/             ← Phase 1 files go here
    │   ├── background/          ← Phase 1 files go here
    │   ├── types.ts             ← existing, kept
    │   ├── logger.ts            ← existing, kept
    │   ├── popup.ts             ← existing, kept (will be updated in Phase 1)
    │   ├── service-worker.ts    ← existing, will be gutted in Phase 1
    │   └── dashboard/           ← existing, will be updated in Phase 2
    └── package.json
```

---

## What's Ready After Setup

- Backend deployed on Cloudflare Workers
- D1 database with full schema (users, workspaces, sessions, credits)
- R2 bucket ready for file storage
- Queue ready for pipeline jobs
- Extension files in place (not loadable in Chrome yet — Phase 1 completes this)

## What's NOT Ready Yet

- Extension cannot be loaded in Chrome (capture files not complete — Phase 1)
- Smart Studio does not exist yet (Phase 2)
- AI pipeline not wired (Phase 3)

---

## Phase 1 Starts Here

Once setup is done and backend is deployed, we move to Phase 1:
building `selector-engine.ts`, `dom-observer.ts`, `keepalive.ts`, `session-manager.ts`, `r2-uploader.ts`.

See `PHASES.md` for full details.
