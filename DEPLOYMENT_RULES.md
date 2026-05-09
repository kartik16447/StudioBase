# ScreenVault Deployment Rules

## Canonical URLs

| Service | URL |
|---|---|
| **Player** | `https://screenvault.karthik-upadhyay98.workers.dev` |
| **Backend API** | `https://screenvault-backend.karthik-upadhyay98.workers.dev` |
| **Proxy Worker** | `https://screenvault-proxy.karthik-upadhyay98.workers.dev` |

`screenvault-player.pages.dev` is a legacy URL — old links still work but
all new links use the Worker URL above.

---

## Full Deploy Checklist (run in this order)

### 1. Backend changed?
```
cd screenvault-backend
npm run deploy
```

### 2. Proxy worker changed?
```
cd screenvault-extension/worker
wrangler deploy
```

### 3. Extension OR Player changed?
```
cd screenvault-extension
npm run build
wrangler deploy
```
`npm run build` populates `dist/`. `wrangler deploy` pushes it to the Worker.
NEVER run `wrangler deploy` from inside `dist/` — it has no wrangler.jsonc.

### 4. Reload extension in Chrome
`chrome://extensions` → reload unpacked → point to `screenvault-extension/dist`

### 5. Keep old `screenvault-player.pages.dev` links working
```
cd screenvault-extension
npx wrangler pages deploy dist --project-name screenvault-player
```
Run this whenever the player UI changes so old shared links still work.

---

## Rules

1. **Always build before deploy** — `npm run build` first, always
2. **Never deploy from `dist/`** — always from `screenvault-extension/`
3. **Player lives in `src/index.html`** — built into `dist/index.html`
4. **PLAYER_BASE_URL = Worker URL** — do not change back to pages.dev
5. **Backend deploy = `npm run deploy`** — not `wrangler deploy` (uses script)
6. **After KV/D1 binding changes** — run `npx wrangler types` in backend

---

## What each deploy affects

| Changed file | Deploy needed |
|---|---|
| `screenvault-backend/src/index.ts` | Backend |
| `screenvault-extension/worker/index.ts` | Proxy worker |
| `screenvault-extension/src/index.html` | Extension build + wrangler deploy |
| `screenvault-extension/src/*.ts` | Extension build + Chrome reload |
| `screenvault-extension/src/dashboard/**` | Extension build + Chrome reload |
| `screenvault-backend/wrangler.jsonc` | Backend + `npx wrangler types` |
