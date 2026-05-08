# ScreenVault Deployment Ground Rules

To prevent "Wrong Place" deployments and player failures (such as mismatched project names or session ID logic), the following rules must be followed:

## 1. Directory & Context Awareness

- **Extension**: Run all commands from the `screenvault-extension/` directory.
- **Backend**: Run all commands from the `screenvault-backend/` directory.
- **Player**: If modifying the player, ensure you are targeting the correct Cloudflare Pages project (`screenvault-player`).

## 2. Project Name Integrity

- **Verification**: Before running `wrangler deploy`, ALWAYS check the `"name"` property in `wrangler.jsonc`.
- **Mistake Prevention**: A wrong project name will overwrite the wrong worker/site, breaking existing functionality.

## 3. Mandatory Build Step

- **Fresh Assets**: NEVER deploy without a fresh build.
- **Extension**: Run `npm run build` to populate the `dist/` folder before deployment.
- **Backend**: Ensure TypeScript compiles correctly before deploying.

## 4. Session & Parameter Accuracy

- **Session IDs**: Ensure `sessionId` and `fileId` mapping logic is consistent across the Extension and Backend.
- **Player URLs**: The `PLAYER_BASE_URL` (currently `https://screenvault-player.pages.dev`) must be verified in `service-worker.ts` before building the extension.

## 5. Deployment Commands

- **Extension Build/Deploy**: `npm run deploy` (runs build + wrangler deploy).
- **Backend Deploy**: `wrangler deploy` (from backend dir).
- **Types**: Run `npx wrangler types` if any bindings (KV, D1, etc.) are changed.

## 6. Observability

- Ensure `observability: { enabled: true }` is set in `wrangler.jsonc` to allow real-time debugging of production errors.

No — because you have multiple separate deploy targets.

Your project currently has:

1. backend worker
2. proxy worker
3. Cloudflare Pages player
4. local Chrome extension build

`wrangler deploy` only deploys the worker in the CURRENT folder.

So if you run it from only one place:

- only that worker updates
- other parts stay stale
- you get version mismatches
- weird bugs happen

Right now your architecture is split.

So you need:

| Component    | Command                                                            | From                           |
| ------------ | ------------------------------------------------------------------ | ------------------------------ |
| Backend API  | `npx wrangler deploy`                                              | `screenvault-backend`          |
| Proxy Worker | `npx wrangler deploy`                                              | `screenvault-extension/worker` |
| Player UI    | `npx wrangler pages deploy dist --project-name screenvault-player` | `screenvault-extension`        |
| Extension    | reload manually in Chrome                                          | local                          |

The player deploy is especially important because:

- duration UI
- speed controls
- metadata rendering
- playback UX

all live inside Pages/static frontend, NOT worker runtime.

If you skip Pages deploy:
you’ll see old UI with new backend behavior again.
