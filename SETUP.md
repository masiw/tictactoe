# Setup — one-time manual steps

You only have to do these once per repo. After this, every prompt you send to Claude Code on the web from your phone will result in a deployed change with no desktop work.

## 1. Push this branch and merge it to `main`

The first version of `main` needs to contain `package.json`, `vercel.json`, the CI workflow, and the SessionStart hook. Merge the bootstrap PR before doing anything else.

## 2. Connect the repo to Vercel

On phone or desktop:

1. Go to <https://vercel.com/new> and sign in with GitHub.
2. Import this repository.
3. Framework preset: **Vite** (Vercel autodetects from `vercel.json`).
4. Build command: `npm run build` — Output directory: `dist` (already in `vercel.json`).
5. Click **Deploy**.

Vercel now auto-deploys:
- Pushes to `main` → production URL
- Open PRs → unique preview URL posted as a comment on the PR

## 3. Enable auto-merge on the repo

GitHub → repo → **Settings → General → Pull Requests** → check **Allow auto-merge**.

## 4. Protect `main` and require CI

GitHub → repo → **Settings → Branches → Add branch ruleset** (or classic rule):

- Branch name pattern: `main`
- Require a pull request before merging: **on**
- Require status checks to pass before merging: **on**
  - Required check: `typecheck, test, build` (the job name in `.github/workflows/ci.yml`)
- Require branches to be up to date before merging: optional (slower, but safer)
- Restrict pushes that create matching branches / Block force pushes: **on**

This is what makes "auto-merge on green CI" actually wait for CI.

## 5. Firebase Realtime Database (for multiplayer)

The multiplayer game state lives in a single Firebase RTDB node. One-time setup:

1. Go to <https://console.firebase.google.com/> → **Add project** (any name).
2. In the project, **Build → Realtime Database → Create Database**. Choose a region. You can start in either test or locked mode — step 6b below replaces the rules with the ones in `database.rules.json` anyway.
3. Project settings (gear icon) → **General → Your apps → Add app → Web**. Register the app. Copy the `firebaseConfig` values.
4. In the Vercel project: **Settings → Environment Variables**. Add the following keys for Production and Preview environments:
   - `VITE_FIREBASE_API_KEY` — from `apiKey`
   - `VITE_FIREBASE_AUTH_DOMAIN` — from `authDomain`
   - `VITE_FIREBASE_DATABASE_URL` — from `databaseURL` (e.g. `https://your-project-default-rtdb.firebaseio.com`)
   - `VITE_FIREBASE_PROJECT_ID` — from `projectId`
5. Redeploy on Vercel (Deployments → ⋯ → Redeploy) so the new env vars are picked up.
6. Locally, copy `.env.example` to `.env.local` and paste the same values, then `npm run dev`.

Without these env vars the app will load and show an inline "Firebase is not configured" message — the build still succeeds, so CI passes.

## 6. Securing the deployment

The Firebase web SDK `apiKey` is *intentionally public* — it ships in the deployed JS bundle, so anyone hitting the production URL can read it from devtools. Security relies on Firebase Realtime Database **security rules**, not on hiding the key. Three one-time steps:

### a. Restrict the API key by HTTP referrer (Google Cloud Console)

1. <https://console.cloud.google.com/> → pick the project linked to Firebase → **APIs & Services → Credentials**.
2. Open the key labelled *Browser key (auto created by Firebase)*.
3. **Application restrictions** → **HTTP referrers (web sites)**. Add:
   - `https://*.vercel.app/*`
   - `https://<your-production-domain>/*` (if you've set a custom Vercel domain)
   - `http://localhost:5173/*` (for `npm run dev`)
4. **API restrictions** → restrict the key to: *Firebase Realtime Database API*, *Identity Toolkit API*, *Token Service API*.
5. Save. Propagation takes a few minutes.

### b. Deploy the Realtime Database rules (automated)

The intended rules live in `database.rules.json` at the repo root. They lock writes to `/games/$gameId`, validate the schema, and reject any other path.

`.github/workflows/deploy-rules.yml` auto-deploys these rules to Firebase whenever `database.rules.json` (or `firebase.json`) changes on `main`. The workflow authenticates with the `FIREBASE_SERVICE_ACCOUNT` and `FIREBASE_PROJECT_ID` repository secrets — set those once (see "One-time setup for automated rules deploys" below) and you never need to touch the Firebase Console for rule changes again.

#### One-time setup for automated rules deploys

1. Google Cloud Console → **IAM & Admin → Service Accounts** in your Firebase project → **Create service account** (e.g. `github-actions-rules`). Grant role: **Firebase Realtime Database Admin**.
2. On the new service account → **Keys → Add key → Create new key → JSON**. Download.
3. GitHub → repo → **Settings → Secrets and variables → Actions** → add two repository secrets:
   - `FIREBASE_SERVICE_ACCOUNT` — paste the entire JSON file contents.
   - `FIREBASE_PROJECT_ID` — your Firebase project ID (e.g. `tictactoe-12345`).

If you ever want to revoke automated deploys, delete the service account key in Google Cloud Console — the workflow will fail and rules will stop auto-deploying, but the rest of the app keeps working.

#### Manual fallback (if you need to bypass CI for any reason)

1. Firebase Console → your project → **Realtime Database → Rules** tab.
2. Replace whatever's there with the contents of `database.rules.json`.
3. Click **Publish**.

After deploying the multi-game version, also delete any pre-existing data under `/game` (singular) from the **Data** tab — it's orphaned and will eventually be ignored, but cleanup keeps the DB tidy.

### c. Rotate the API key if it's ever been exposed

If the key was ever committed to git (even to a private repo), rotate it:

1. Google Cloud Console → **Credentials** → on the browser key, click **Regenerate key** → confirm. Copy the new value.
2. Vercel → project → **Settings → Environment Variables** → edit `VITE_FIREBASE_API_KEY` → paste the new value (Production + Preview).
3. Vercel → **Deployments** → on the latest production deploy: ⋯ → **Redeploy** (untick "Use existing Build Cache").
4. Locally, paste the same new value into `.env.local`.

The previous key is now revoked; any copy of it lying around (including in git history) is useless.

## 7. (Optional) Subscribe Claude to your PRs

When Claude opens a PR for you, you can ask it to "watch this PR" — it'll then auto-respond to CI failures and review comments without you re-prompting.

## Mobile workflow after setup

1. Open Claude Code on the web on your phone.
2. Prompt a change ("add a 4x4 mode", "make the X red", whatever).
3. Claude edits → commits to a feature branch → opens a PR → enables auto-merge.
4. CI runs (~1 min). If green, GitHub merges it. Vercel deploys to production.
5. You get the live URL from the Vercel comment on the PR.

## Reusing this for new projects

The pieces that make this work:
- `package.json` with `check`, `test`, `build` scripts
- `.github/workflows/ci.yml` running those three
- `vercel.json` declaring framework + output dir
- `CLAUDE.md` telling Claude to PR-and-auto-merge instead of pushing to `main`
- `.claude/hooks/session-start.sh` + `.claude/settings.json` so web sessions install deps before working
- Repo settings: branch protection on `main`, "Allow auto-merge" enabled, Vercel connected

Copy those into any new repo and you're done.
