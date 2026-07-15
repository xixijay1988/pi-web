# Pi Desktop

Desktop shell for this pi-web fork. Product name: **Pi Desktop**.

The web app stays at the repository root so upstream merges from [agegr/pi-web](https://github.com/agegr/pi-web) stay straightforward. Desktop-only code lives under `desktop/`.

## Architecture

```text
Electron main process
  ├─ dev: open http://127.0.0.1:30141 (requires `npm run dev`)
  └─ prod: spawn Next via Electron-as-Node
           next start -p 30142 -H 127.0.0.1
           BrowserWindow loads that URL

Shared data: ~/.pi/agent (same as CLI / upstream pi-web)
```

Design constraints:

- Zero-to-minimal web source changes
- Desktop default port **30142**, CLI/dev stay on **30141**
- Bind **127.0.0.1 only**
- Close window = quit app + stop server
- v1: no tray, no auto-update, unsigned packages

## Development

Install dependencies once:

```bash
npm install
```

Terminal 1 — web:

```bash
npm run dev
```

Terminal 2 — desktop window:

```bash
npm run desktop:dev
```

`desktop:dev` does not start Next itself. If the dev server is down, the app shows an error dialog and points at the log file under Electron `userData`.

Dev window loads `http://localhost:30141` (not `127.0.0.1`) so Next.js client hydration works. Next 16 blocks unlisted dev origins; this repo allows `localhost`, `127.0.0.1`, and `192.168.*.*` via `allowedDevOrigins` in `next.config.ts`.

## Production run (unpacked)

```bash
npm run build
npm run desktop:start
```

This uses the repo `.next` build and spawns Next with Electron's Node runtime (`ELECTRON_RUN_AS_NODE=1`), so a system Node install is not required at runtime.

## Packaging

Local package (current platform):

```bash
npm run desktop:pack
```

Platform-specific:

```bash
npm run desktop:pack:mac
npm run desktop:pack:win
```

Artifacts land in `desktop/dist/`.

Packaged layout:

- Electron app code: `desktop/main.js`, `desktop/preload.js`
- Web runtime resources: `Resources/web/` (`.next`, `node_modules`, `package.json`, `next.config.ts`)

v1 packages are **unsigned** (macOS may require right-click → Open; Windows may show SmartScreen).

## Coexistence with CLI

| Surface | Default URL | Distribution |
| --- | --- | --- |
| `pi-web` / `npx @agegr/pi-web` | `http://localhost:30141` | npm |
| Pi Desktop | `http://127.0.0.1:30142` | GitHub Release installers |

Both read/write the same `~/.pi/agent` data. Avoid running two agent sessions against the same session id concurrently.

## Upstream sync

This repo is a long-lived fork. Keep desktop work merge-friendly:

```bash
git remote add upstream https://github.com/agegr/pi-web.git   # once
git fetch upstream
git merge upstream/main
```

Rules of thumb:

- Prefer conflicts in `package.json` / lockfiles over web rewrites
- Never move the Next app into `apps/web` just for monorepo purity
- Keep product-only behavior inside `desktop/`
- Upstream-relevant bugfixes can still be contributed back as PRs

## Logs

Main process log:

- macOS: `~/Library/Application Support/Pi Desktop/pi-desktop.log`
- Windows: `%APPDATA%/Pi Desktop/pi-desktop.log`

## Out of scope for v1

- Tray / launch-at-login
- Auto-update
- Code signing / notarization
- CI matrix packaging
- Deep native menus wired to web actions
