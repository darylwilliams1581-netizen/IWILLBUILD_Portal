# IWIllBUIlD — one source of truth

Airo / GoDaddy still **hosts and edits the live website**.
GitHub is the **only source of code that ships** to Appflow / TestFlight.

Do not let two AIs write the same files.

## Who owns what

| Surface | Owner | Tool | Ships through |
|---|---|---|---|
| Live website `iwillbuild.com` | Airo + GoDaddy | Airo chat / WP admin | GoDaddy hosting |
| Portal source in this repo | GitHub `main` | Desktop push + this PR process | Appflow only from `main` |
| Native iPhone camera + offline | `IWILLBUILD-iOS` | Codex only | Appflow / Xcode → TestFlight |

## This repo (`IWILLBUILD_Portal`)

**Airo may change**

- Website copy, pages, media
- `.airo/`, `airo-media.json`, content/plugin folders
- Ordinary UI in `src/pages` and `src/components` that is not camera or Capacitor

**Airo must not change**

- `ios/`
- `android/`
- `capacitor.config.ts`
- `capacitor.config.json`
- `src/lib/capacitor-plugins.ts`
- `src/lib/capturePhotoLocally.ts`
- any `*camera*` / `*PhotoUpload*` files
- `.github/workflows/`
- this file, `AGENTS.md`, `CODEOWNERS`

**Codex must not change (in this repo)**

- Airo content dumps that rewrite the whole tree
- GoDaddy hosting settings
- A second Capacitor camera rewrite

Codex camera work belongs in **https://github.com/darylwilliams1581-netizen/IWILLBUILD-iOS**

## Desktop rule

Your local folder may still pull this repo.

1. `git checkout main && git pull`
2. Website work → branch `airo/web`
3. API / server work → branch `codex/api`
4. Never start a Codex chat on an uncommitted Airo export
5. Look at `git diff --stat` before push. If camera + a label change are in the same commit, split it.
6. Appflow builds **`main` only**

## Airo export rule

If Airo pushes a new export branch:

1. Do not merge it straight into `main`
2. Open a PR
3. Drop any files in the freeze list above
4. Then merge

## Capacitor wrapper status

Appflow Build #80 (`69e2bbdb`) is the website-in-a-shell binary.
It can stay as a phone viewer of the portal.
It is **not** the field camera product.
Do not spend more Airo chats making that wrapper's camera native.

## API the iOS app must use

Live host: `https://iwillbuild.com`

- Auth: same better-auth session / cookie or token the portal already uses
- Job list: existing `/api/` job endpoints (company scoped)
- Photo upload: `POST /api/jobs/:id/photos`
- Photos stay company scoped. No cross-company reads.

The iPhone saves the file on device first, then uploads when online.
