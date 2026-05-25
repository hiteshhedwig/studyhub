# Study Hub Progress

Last updated: 2026-05-25

## Current State

Study Hub is a local-first desktop study app built with:

- Tauri 1, adjusted for Ubuntu 20.04 WebKitGTK 4.0 compatibility.
- React + TypeScript + Vite.
- SQLite via `sql.js`, persisted locally through IndexedDB.
- Zustand stores for app data and session timer state.
- Chart.js via `react-chartjs-2`.
- Zod import validation.
- Vitest tests.
- Plain CSS warm dark / soft light theme tokens.

The app has these main sections:

- Today
- Sessions
- Topics
- Cheatsheets
- Materials
- Question Bank
- Practice
- Revisions
- Stats
- Settings

## Major Features Implemented

### Local Data Layer

- SQLite schema and migrations exist in `src/db/schema.ts` and `src/db/migrations.ts`.
- Database persistence is handled in `src/db/database.ts` through IndexedDB.
- Repository/service separation is in place.
- Main repository file: `src/db/repositories/studyRepository.ts`.

### Study Session Flow

- Today page can start focused sessions.
- Sessions can use planned cycles or open-ended mode.
- Planned sessions support:
  - planned cycles
  - after-final-cycle behavior
  - optional long break
  - computed duration summary
- Pomodoro timer uses timestamp-based state rather than simple interval decrementing.
- Session closeout supports:
  - notes
  - reflection
  - understanding/difficulty ratings
  - ChatGPT link
  - attaching cheatsheets
  - importing Q&A JSON
  - spaced repetition scheduling

### Shared Timer Store

- Timer state lives in `src/store/sessionTimerStore.ts`.
- Pure timer helpers live in `src/services/timerLogic.ts`.
- Tests live in `src/services/timerLogic.test.ts`.
- Timer sync uses:
  - Zustand
  - localStorage
  - BroadcastChannel
  - Tauri native events
- This sync fixed the issue where pausing in Mini Overlay did not pause the main Today timer.

### Mini Overlay

- Implemented as a real separate Tauri window.
- Route: `/#/overlay`.
- Files:
  - `src/features/overlay/MiniOverlay.tsx`
  - `src/features/overlay/MiniOverlayControls.tsx`
  - `src/features/overlay/miniOverlay.css`
  - `src/services/overlayWindowService.ts`
- Overlay supports:
  - expanded/collapsed mode
  - always-on-top window
  - frameless window
  - drag handle/top drag area
  - pause/resume
  - skip
  - collapse/expand
  - close
  - synced active timer display
- Current expanded size is `320 x 190`.
- Current collapsed size is `220 x 72`.

### Materials Section

- Added `src/features/materials/MaterialsPage.tsx`.
- Lets users attach existing cheatsheets or import Q&A JSON into a topic without starting a Pomodoro.
- This solves the issue where pre-existing learning materials were forced through session flow.

### Cheatsheets

- Multiple cheatsheets can be attached to the same session/topic.
- Session closeout now acknowledges attached cheatsheets and imported Q&A immediately.
- Cheatsheets page supports:
  - search/filter
  - open local file
  - rename
  - delete

### Question Bank

- Supports validated ChatGPT Q&A JSON import.
- Can delete individual questions.
- Can delete whole question sets.
- Question set deletion cascades through contained questions and review attempts.

### Topics / Sessions CRUD

- Topics can be deleted with confirmation.
- Topic deletion cascades related sessions, cheatsheets, question sets, questions, revisions, review attempts, and resource links.
- Sessions can be deleted with confirmation.

### Revisions Redesign

- Revisions page no longer allows future upcoming revisions to be completed.
- Only due today and late revisions show rating/completion controls.
- Upcoming revisions are informational only.
- Added interval styling:
  - day 1
  - day 3
  - week 1
  - week 2
  - month windows
- Added monthly calendar view.
- Fixed layout issue where long upcoming lists stretched the calendar column.
- Upcoming list now scrolls inside a bounded panel.

## Tauri Compatibility Notes

The project was switched from Tauri 2 to Tauri 1 because the machine is Ubuntu 20.04 and has WebKitGTK 4.0 packages installed. Tauri 2 required WebKitGTK 4.1 / libsoup 3.0, which failed on this setup.

Relevant files:

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

Tauri APIs use Tauri 1 imports such as:

- `@tauri-apps/api/window`
- `@tauri-apps/api/dialog`
- `@tauri-apps/api/fs`
- `@tauri-apps/api/shell`
- `@tauri-apps/api/notification`
- `@tauri-apps/api/event`

## Verification Commands

These passed after the latest changes:

```bash
npm test
npm run build
cargo check
```

`npm run tauri dev` has also been used successfully after the Tauri 1 switch.

## Known Warnings

`npm run build` shows a Vite chunk size warning because the app includes sql.js and charting dependencies. This is not currently breaking the build.

There is also a Vite note about `@tauri-apps/api/event.js` being dynamically and statically imported. It is informational and not currently breaking anything.

## Likely Next Improvements

- Revisions page could use more polish:
  - better calendar detail interaction
  - click a calendar day to inspect revisions
  - clearer missed/rescheduled states
  - reschedule controls
- Materials page could be expanded:
  - drag/drop import
  - inline create-topic flow
  - preview parsed Q&A before import
- Question Bank editing is still minimal:
  - add inline edit for question/answer/difficulty/tags
- Topic details could expose more management:
  - edit topic title/description/status
  - resource link editing/deletion
- Data import/export/backup in Settings is still mostly placeholder.
- Mini Overlay design has been improved but may need visual tuning from real usage screenshots.

