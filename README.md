<img src="web/logo.svg" width="64" height="64" alt="Waffle">

# Waffle

A small focus timer with a daily limit. Plan your focus and waffle sessions, work in 30-minute blocks, and rate how each one went.

**[Open Waffle](https://kkonrad.com/waffle/)**

- Adjust the morning plan, commit, and edit the counts by tapping either session counter.
- Rate each completed session as focused or waffle. Both use the same daily allowance.
- Pause and resume, end early, or correct a past rating.
- See each session in the calendar: dark tiles for focus, yellow for waffle.
- Build a streak by meeting the focus target within the waffle allowance. Planned days off hold the streak.
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
```

If using another port, set the browser test URL:

```sh
WAFFLE_URL=http://localhost:8765/ npm run test:browser
```

GitHub Actions runs both suites. They cover timer recovery, daily limits, ratings, corrections, streaks, midnight rollover, offline use, backups, concurrent windows, and mobile layouts. Browser screenshots and test backups go into the ignored `artifacts/qa/` directory.

## Saved data and Android behavior

Plans, ratings, settings, and the active timer stay in this browser’s IndexedDB. There is no account, backend, analytics, or automatic device sync. Clearing site data removes that device’s history; settings include backup download and restore.

The timer saves its deadline, so reloading or returning after suspension recovers the elapsed time. Paused timers preserve their remaining time. A session crossing midnight belongs to the day it started.

“Keep screen on” applies while Waffle is visible and a session is running. Android may suspend a background PWA, so this app cannot guarantee an alarm while the phone is locked or the app is closed. A finished session waits for its rating when you return.

## Release to kkonrad.com

The live app is currently published by [the website repository](https://github.com/0xkkonrad/0xkkonrad.github.io), from its `static/waffle/` directory. This repository holds the standalone source and runs checks; pushing here does not automatically deploy the website.

To release an update:

1. Run both test suites and bump the `waffle-shell-…` cache name in `web/sw.js` when a cached asset changes.
2. Copy the contents of `web/` into the website repository’s `static/waffle/` directory.
3. Commit and push the website change to `master`. Its existing Deploy workflow publishes GitHub Pages.
4. Verify the live app, its offline reload, and the update flow. The new worker waits until an existing user chooses “update available”; saved timer state survives that reload.

The manifest and service worker resolve paths relative to the app, so production stays scoped to `/waffle/`. Roll back by publishing the previous app files with a new cache name. Do not clear users’ IndexedDB during a code rollback.

## Design and provenance

The app uses the round bitten Waffle logo, IBM Plex Mono, and the Butter palette. IBM Plex Mono’s license is included in [web/fonts/OFL.txt](web/fonts/OFL.txt).

This repository starts from the deployed Waffle files in website commit [`0577663`](https://github.com/0xkkonrad/0xkkonrad.github.io/commit/057766359c39f825e4e006d94a738267c8b32f14), including the settings controls update. The app files are unchanged; test paths were adjusted for the standalone layout.
