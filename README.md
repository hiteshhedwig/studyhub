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
