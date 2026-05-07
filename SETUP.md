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

## 5. (Optional) Subscribe Claude to your PRs

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
