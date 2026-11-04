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

- `src/game.ts` — pure Tic-Tac-Toe logic, fully unit-tested
- `src/dominoes.ts` — pure Dominoes logic (`fullSet`, `dealHands`, `tilePlayability`, `placeOnRight`/`placeOnLeft`, `pipSum`, tile serialization), fully unit-tested
- `src/firebase.ts` — Firebase init + `getDb()`
- `src/multiplayer.ts` — Tic-Tac-Toe multiplayer primitives. Data model: `/games/{pushKey}`. `planMatch`, `claimMatch`, `makeMove`, `declareForfeit`, `subscribeGame`, `shouldForfeit`, `isExpired`, `revealPreviousMove`. Move clock is `MOVE_CLOCK_MS` (2 min) tied to `lastMoveAt`.
- `src/dominoesMultiplayer.ts` — Dominoes multiplayer primitives. Data model: `/dominoes/{pushKey}` with serialized tile chains (`board: string`, `p1.hand`/`p2.hand: string`). Mirrors the matchmaking shape of `multiplayer.ts`. `applyAction` handles both `place` and `pass`; ends the game when a hand empties or both players consecutively pass (blocked → lower pip total wins, tie is a draw).
- `src/rummikub.ts` — pure Rummikub logic (106-tile set: 1–13 in four colours, two of each, plus 2 jokers). `fullSet`, `deal`, `isValidGroup`/`isValidRun`/`isValidSet`, `setValue`, `handScore`, and `validateCommit` (the authentic turn validator: tile conservation, ≥1 tile played from hand, every set valid, and before a player's opening meld the table must be untouched and the new sets total ≥30). Tiles serialize as `${color}${number}`/`j` strings; table as `;`-separated, `,`-joined sets. Fully unit-tested.
- `src/rummikubMultiplayer.ts` — Rummikub multiplayer primitives. Data model: `/rummikub/{pushKey}` (`table: string`, `pool: string`, `p1.hand`/`p2.hand: string`, `openingP1`/`openingP2: bool`). Online only. `applyAction` handles `commit` (submit new table + remaining hand, validated via `validateCommit`), `draw` (take from pool), and `pass` (only when pool empty). Authentic: 30-point opening meld + full table manipulation. Win on empty hand; blocked game (both pass, empty pool) scored by lower `handScore` (joker = 30), tie is a draw.
- `src/App.svelte` — tiny URL router. Tracks `location.pathname` and `location.search` reactively. Routes:
  - `/` → `Home`
  - `/tictactoe`, `/dominoes`, `/rummikub` (no `mode` param) → `GameSettings`
  - `/tictactoe?mode=network` → `TicTacToe` · `?mode=single` → `TicTacToeSingle`
  - `/dominoes?mode=network` → `Dominoes` · `?mode=single` → `DominoesSingle`
  - `/rummikub?mode=network` → `Rummikub` (online only for now; `?mode=single` falls back to `GameSettings`)
  Owns the global `html`/`body` styles. Handles `popstate` for browser back/forward.
- `src/Rummikub.svelte` — networked Rummikub UI. On your turn it opens an editable workspace (copy of the table + your hand); tap a tile then tap a set / ＋ New set / ↩ to hand to rearrange. "End turn" is enabled only when `validateCommit` passes. `src/RummikubTile.svelte` renders a single tile (coloured numeral, ★ for joker).
- `src/Home.svelte` — game lobby. Receives `navigate` from `App`.
- `src/GameSettings.svelte` — settings page shown when a game route has no `mode` param. Lets the player pick **Over the network** or **On a single device**; "Start game" navigates to `/{game}?mode={mode}`. Settings live in URL params only — no localStorage / cookies.
- `src/TicTacToe.svelte` / `src/Dominoes.svelte` — networked multiplayer UI components. Own gameplay state, Firebase subscriptions, forfeit detection, animations.
- `src/TicTacToeSingle.svelte` / `src/DominoesSingle.svelte` — same-device variants. Pure local state, no Firebase. Tic-Tac-Toe single is straightforward turn-take; Dominoes single uses a `pass-device` phase between turns so the receiving player taps **Ready** before their hand is revealed, preserving hand privacy.
- `src/OutcomeOverlay.svelte` — shared win/lose animation. Pass `outcome="fireworks" | "rain" | null`; parent controls the 3-second timer that resets it to null.
- `src/main.ts` — entry
- `src/*.test.ts` — Vitest specs (pure logic only — no network)
- `database.rules.json` — Firebase RTDB security rules (source of truth; deployed automatically by `.github/workflows/deploy-rules.yml`). Path: `/games/$gameId`.
- `firebase.json` — points the Firebase CLI at `database.rules.json`.
- `.github/workflows/deploy-rules.yml` — auto-deploys rules to Firebase on push to `main`.
