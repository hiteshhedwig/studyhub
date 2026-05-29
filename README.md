# Study Hub

A local-first desktop study app. Run focused Pomodoro sessions, capture cheatsheets and
ChatGPT-generated Q&A, practice with active recall, and let spaced repetition schedule your
revisions — all stored **on your own device**. No account, no sync, no analytics, no remote
database.

Built with **Tauri + React + TypeScript**, with a local **SQLite** database (via `sql.js`,
persisted to IndexedDB).

## Features

- **Today** — start planned-cycle or open-ended Pomodoro sessions with a circular timer.
- **Mini Overlay** — a small always-on-top companion window for the active timer.
- **Sessions** — a record of focused work, notes, and reflections.
- **Topics** — organize what you're learning, with mastery and revision tracking.
- **Cheatsheets & Materials** — link local files and import Q&A into a topic.
- **Question Bank & Practice** — validated Q&A import and active-recall practice.
- **Revisions** — spaced repetition with a monthly calendar view.
- **Stats** — focus time, recall, and revision completion at a glance.

## Tech stack

React 19 · TypeScript · Vite · Tauri 1 · sql.js (SQLite) · Zustand · Chart.js · Zod · Vitest

> Tauri 1 (not 2) is used for WebKitGTK 4.0 compatibility on Ubuntu 20.04.

## Getting started

**Prerequisites:** Node 18+, Rust (stable), and the
[Tauri 1 system dependencies](https://tauri.app/v1/guides/getting-started/prerequisites)
(on Ubuntu: `libwebkit2gtk-4.0-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`,
`librsvg2-dev`, `patchelf`).

```bash
npm install

# Web preview in the browser (http://127.0.0.1:5199)
npm run dev

# Desktop app (Tauri starts the dev server itself — do not run `npm run dev` first)
npm run tauri dev

# Run tests
npm test
```

## Building installers

### Linux (build locally)

```bash
npm run tauri build
```

Produces an AppImage, `.deb`, and `.rpm` under
`src-tauri/target/release/bundle/`. Make the AppImage executable and run it:

```bash
chmod +x src-tauri/target/release/bundle/appimage/study-hub_*.AppImage
./src-tauri/target/release/bundle/appimage/study-hub_*.AppImage
```

### Windows + Linux (via GitHub Actions)

Windows installers can't be cross-compiled from Linux, so the repo ships a release workflow
(`.github/workflows/release.yml`) that builds each OS on its own runner. Tag a release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

This builds the Windows `.exe`/`.msi` and a Linux `.AppImage` and attaches them to a draft
GitHub Release. (You can also trigger it manually from the **Actions** tab.)

## Project structure

```
src/              React app
  app/            Router + shell
  components/     Shared UI (layout, cards, charts, timer ring)
  features/       One folder per page (today, sessions, topics, revisions, …)
  db/             SQLite schema, migrations, repositories
  services/       Timer logic, spaced repetition, imports, file storage
  store/          Zustand stores (app data + session timer)
  styles/         Design tokens, themes, global styles
src-tauri/        Rust / Tauri shell, config, icons
```

## Privacy

Everything lives in a local SQLite database on your machine. The app makes no network calls
and collects no telemetry.

## Architecture & development notes

Quick context for anyone (or any agent) returning to the codebase cold.

### Layout reminders

- **Two sibling folders exist on disk** — `studyhub/` (the older project) and `studyhub_cladue/`
  (the active one). Always work in `studyhub_cladue/`.
- Dev server port is **5199** (`vite --host 127.0.0.1`); the Tauri dev command starts Vite
  itself, so don't run `npm run dev` separately when using `npm run tauri dev`.
- A scratch `progress.md` at repo root is a free-form local log; not user-facing.

### Stores

- `store/appStore.ts` — Zustand store holding the loaded DashboardData (categories, topics,
  sessions, cheatsheets, question sets, questions, revisions, links) plus theme. All mutating
  methods are wrapped to call `refresh()` after the mutation so the UI re-reads from SQLite.
- `store/sessionTimerStore.ts` — the Pomodoro timer state. Persisted to `localStorage` and
  synced across windows via a `BroadcastChannel` *and* a Tauri event (so main ↔ overlay stay
  in lockstep). Timer reducer logic lives in `services/timerLogic.ts` (pure functions, unit
  tested).
- `store/uiStore.ts` — toast queue + confirm dialog request. Use `toast.success/info/warning/danger(msg)`
  and `await confirmDialog({ title, message, tone })` from anywhere instead of native
  `confirm()` or ad-hoc `setMessage` state.

### Timer flow (important — the "soft stop" UX)

A phase no longer auto-rolls into the next one. When focus/break reaches 0:

1. `completeCurrentPhase` sets `awaitingNextPhase` and pauses (`isRunning=false`).
2. `useTimerSounds` rings the bell (and ticks during the last 5s).
3. The UI shows a confirmation card with a single primary button.
4. The user clicks → `confirmNextPhase` starts the next phase.

The "ask after final cycle" preset uses a separate `awaitingFinalChoice` flow with three
buttons. Don't merge the two states.

### Sounds

`services/soundService.ts` generates tones via Web Audio (no asset bundling). Volume is
persisted in `localStorage` (`study-hub-sound-volume`, 0–5×) and adjusted from Settings.
A first-click `unlockAudio()` is required because WebKitGTK suspends new AudioContexts
until user gesture.

### Cross-window state

The Mini Overlay is a separate Tauri WebviewWindow running the same React bundle at
`/#/overlay`. Anything it needs to react to live (timer snapshot, overlay prefs, theme)
must be pushed via `BroadcastChannel`, a Tauri event, OR a `storage` event — the overlay
won't see same-window React state.

### Build & releases

- Linux AppImage built on **Ubuntu 22.04 runner inside an `ubuntu:20.04` container** in
  `.github/workflows/release.yml`. This pins glibc to 2.31 so the AppImage runs on Ubuntu
  20.04+ hosts. Don't drop the container or the AppImage stops working on older systems.
- Windows installers (.msi + .exe) built on `windows-latest`.
- Version bumps for a tag must touch **five** files: `package.json`, `package-lock.json`,
  `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` (the
  `study-hub` package entry). Then `git tag vX.Y.Z && git push origin vX.Y.Z`.
- The release is created as a **draft** — a stale draft from a botched tag must be
  deleted in the GitHub Releases UI before re-tagging the same version.

### Validation gates

Before tagging, run:

```bash
npx tsc --noEmit   # typecheck
npm test           # vitest (timer logic, importer, spaced repetition)
npm run build      # vite build catches a few things tsc misses
```

There's no CI gating commits, so these are honour-system.
