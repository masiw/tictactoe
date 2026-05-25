# CLAUDE.md

Guidance for Claude Code sessions in this repo (especially Claude Code on the web from mobile).

## Stack

- Svelte 4 + TypeScript
- Vite (dev server, bundler)
- Vitest (unit tests)
- Firebase Realtime Database for shared multiplayer state (client-only; no backend code in this repo)
- Deploy target: Vercel (auto-deploys on push to `main`, preview deploys for PRs)

## Env vars

Firebase config comes from `VITE_FIREBASE_*` env vars (see `.env.example` and `SETUP.md`). They're public web-app keys — safe in client bundles — but `.env.local` is gitignored and must stay that way. **Never re-add it to git** (no `git add -f .env.local`, no pasting values into committed files).

## Firebase security rules

`database.rules.json` at the repo root is the source of truth for the deployed Realtime Database rules. If you change the data model in `src/multiplayer.ts` (e.g. add a field to `GameState`), update `database.rules.json` in the same PR so the rules don't reject the new shape. The `.github/workflows/deploy-rules.yml` workflow auto-publishes the rules to Firebase whenever `database.rules.json` (or `firebase.json`) changes on `main`, using the `FIREBASE_SERVICE_ACCOUNT` and `FIREBASE_PROJECT_ID` repo secrets.

## Commands

- `npm install` — install deps (handled automatically by the SessionStart hook on web)
- `npm run dev` — dev server
- `npm run check` — typecheck (svelte-check)
- `npm test` — run unit tests once
- `npm run build` — production build (typecheck + Vite build)

## Mobile workflow (the way this repo is meant to be used)

The user prompts from mobile. For any change you make:

1. Make edits on a feature branch (never commit directly to `main`).
2. Run `npm run check` and `npm test` locally before pushing.
3. Open a PR to `main` with a short description.
4. Enable auto-merge on the PR (squash). CI runs typecheck + tests + build; if green, GitHub merges it and Vercel deploys to production.

Use the `mcp__github__*` tools for all GitHub operations — there is no `gh` CLI in this environment.

## What NOT to do

- Don't push directly to `main` — branch protection will reject it, and even if it didn't, that bypasses CI.
- Don't disable CI checks or branch protection to "make it work."
- Don't add tests that hit the network or filesystem in unit-test scope; keep `npm test` fast so auto-merge stays snappy.
- Don't introduce a backend or server-rendered framework without asking — the deploy is configured for a static SPA.

## Project layout

- `src/game.ts` — pure game logic, fully unit-tested
- `src/firebase.ts` — Firebase init + `getDb()`
- `src/multiplayer.ts` — shared-state primitives. Data model: `/games/{pushKey}` (top of stack = newest push key). Key functions: `planMatch` (pure matchmaking + lazy-sweep selection), `claimMatch` (page-load entry — rejoin / join / create), `makeMove`, `declareForfeit`, `subscribeGame`, `shouldForfeit`, `isExpired`. Move clock is `MOVE_CLOCK_MS` (2 min) tied to `lastMoveAt`.
- `src/App.svelte` — UI; renders loading / p1-waiting / p1-expired / playing / finished. No spectator role. Caches last non-null game state so the eager-deleted finished game still shows.
- `src/main.ts` — entry
- `src/*.test.ts` — Vitest specs (pure logic only — no network)
- `database.rules.json` — Firebase RTDB security rules (source of truth; deployed automatically by `.github/workflows/deploy-rules.yml`). Path: `/games/$gameId`.
- `firebase.json` — points the Firebase CLI at `database.rules.json`.
- `.github/workflows/deploy-rules.yml` — auto-deploys rules to Firebase on push to `main`.
