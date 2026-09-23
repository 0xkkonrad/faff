<img src="web/logo.svg" width="64" height="64" alt="Faff">

# Faff

A small focus timer with a daily limit. Plan your focus and faff sessions, work in 30-minute blocks, and rate how each one went.

**[Open Faff](https://kkonrad.com/faff/)**

- Adjust the morning plan, commit, and edit the counts by tapping either session counter.
- Rate each completed session as focused or faff. Both use the same daily allowance.
- Pause and resume, end early, or correct a past rating.
- Choose a bell, chime, or double beep for session endings, with a volume control and preview.
- Play optional brown noise or soft rain during sessions. Background audio pauses with the timer.
- See each session in the calendar: dark tiles for focus, citron for faff.
- Build a streak by meeting the focus target within the faff allowance. Planned days off hold the streak.
- Install on Android, use offline, and download or restore a backup.

## Run locally

Requires Node.js and Python 3. CI uses Node.js 24.

```sh
npm ci
npm run dev
```

Open **http://localhost:8777/index.html**. If that port is busy:

```sh
python3 -m http.server 8765 --directory web
```

Then open **http://localhost:8765/index.html**.

The app has no runtime dependencies or build step. `web/` contains the complete static PWA; npm dependencies are only for testing. While changing cached assets, unregister the local service worker in browser developer tools or use a fresh browser profile.

## Checks

With the local server running:

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run test:sounds
npm run test:pwa
npm run test:rebrand
```

If using another port, set the browser test URL:

```sh
FAFF_URL=http://localhost:8765/ npm run test:browser
```

GitHub Actions runs these checks. They cover timer recovery, daily limits, ratings, corrections, streaks, midnight rollover, offline use, backups, concurrent windows, keyboard focus, mobile layouts, sound output, and service-worker updates with running, paused, and completed timers. Browser screenshots and test backups go into the ignored `artifacts/qa/` directory.

After `npx playwright install webkit`, run the UI regressions in WebKit with `FAFF_BROWSER=webkit node tests/browser-regressions.cjs`. To test migration from a prior release, set `FAFF_PREVIOUS_WEB` to its `web/` directory when running `npm run test:pwa`.

## Saved data and Android behavior

Open **sounds** from the timer or the options menu. Session chimes and background audio have separate volume controls. Background audio is off by default; it follows the timer once selected. Previews last five seconds and stop when the sound panel closes. All sounds are generated on the device, work offline, and need no audio downloads. Browsers require a tap to enable audio after reloading a running timer; Faff shows **enable sound** when needed. Browsers with Web Locks play background audio in one Faff window at a time.

Plans, ratings, settings, and the active timer stay in this browser’s IndexedDB. There is no account, backend, analytics, or automatic device sync. Clearing site data removes that device’s history; settings include backup download and restore.

The timer saves its deadline, so reloading or returning after suspension recovers the elapsed time. Paused timers preserve their remaining time. A session crossing midnight belongs to the day it started.

“Keep screen on” applies while Faff is visible and a session is running. Android may suspend a background PWA, so this app cannot guarantee an alarm while the phone is locked or the app is closed. A finished session waits for its rating when you return.

## Release to kkonrad.com

The live app is currently published by [the website repository](https://github.com/0xkkonrad/0xkkonrad.github.io), from its `static/faff/` directory. This repository holds the standalone source and runs checks; pushing here does not automatically deploy the website.

To release an update:

1. Run all checks above and bump the `faff-shell-…` cache name in `web/sw.js` when a cached asset changes.
2. Copy the contents of `web/` into the website repository’s `static/faff/` directory. Keep `legacy/` at the former app route so bookmarks and installed apps move to Faff.
3. Commit and push the website change to `master`. Its existing Deploy workflow publishes GitHub Pages.
4. Verify the live app, its offline reload, and the update flow. The new worker waits until an existing user chooses “update available”; saved timer state survives that reload.

The manifest and service worker resolve paths relative to the app, so production stays scoped to `/faff/`. Roll back by publishing the previous app files with a new cache name. Do not clear users’ IndexedDB during a code rollback.

## Design and provenance

Keep app copy to short labels, recovery instructions, and consequences the controls cannot show. Avoid helper paragraphs that explain visible controls or repeat the current state. Preserve accessible names and live announcements.

The app uses the provisional 01A Loose end mark, IBM Plex Mono, and a paper, graphite, and citron palette. The [logo picker](https://kkonrad.com/faff/brand/index.html) contains 10 directions with 5 SVG variations each. Run `npm run build:brand` to regenerate the catalog and provisional SVG, then `node scripts/build-icons.cjs` to regenerate install icons. IBM Plex Mono’s license is included in [web/fonts/OFL.txt](web/fonts/OFL.txt).

This repository started from the deployed timer files in website commit [`0577663`](https://github.com/0xkkonrad/0xkkonrad.github.io/commit/057766359c39f825e4e006d94a738267c8b32f14), including the settings controls update. Subsequent changes and verification are recorded in [the QA report](docs/qa-2026-09-22.md).

## Rebrand migration

Faff uses schema version 2 and a database named `faff`. Installed users apply the update through the existing “update available” option. On first open, Faff copies and validates the previous installation’s saved plan, history, settings, and active timer. The original database is retained. Existing Faff data is never overwritten by this migration. Backups from either release can be restored; new downloads use the Faff format. Legacy identifiers are isolated in `web/migration.js` and migration tests because existing saves and bookmarks depend on them.
