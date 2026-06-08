# StudioBase — Claude Code Rules

## Token efficiency (always apply)
- `grep -n "pattern" file | head -20` before any Read
- Read with `offset`/`limit`, never full file unless <80 lines
- Confirm a symbol exists before following import chains
- No agents (no Agent tool calls) unless explicitly asked
- No browser preview unless explicitly asked
- Use `--max-turns 3` if you must run a subagent

## Stack
- Frontend: React 19 + TypeScript + Vite + Zustand — lives in `studio/`
- Backend: Hono on Cloudflare Workers + D1 + R2 — lives in `backend/`
- Extension: Chrome MV3 — lives in `extension/`
- Deploy: `git push origin main` → Vercel auto-deploys studio; `wrangler deploy` for backend

## Commit convention
`fix:` `feat:` `refactor:` `style:` `debug:` `chore:`

## End-of-session checklist (run before stopping)
1. `cd studio && npx tsc --noEmit` — fix all errors before committing
2. `git add <specific files> && git commit -m "..."` — never `git add -A`
3. `git push origin main`
4. If backend changed: `wrangler deploy --env production`
5. If DB schema changed: run migration via wrangler d1 execute

## Surgical fix format (use this when fixing bugs)
State what you changed after each fix before moving to the next.
Fix issues in the order listed. No other changes beyond what is asked.
