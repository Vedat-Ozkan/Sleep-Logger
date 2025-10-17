# ChronoTrack – React Native Sleep Tracker

Lightweight, offline-first sleep tracking with a 60fps gesture timeline, timezone-aware logic, and reliable reminders. Built with React Native + Expo, SQLite, Reanimated, and TypeScript.

> What’s in here (short): gesture-based timeline editor, UTC storage with local rendering, precomputed day indices for fast calendars, push notifications for reminders, Jest tests, and GitHub Actions CI.

## Highlights
- Gesture timeline editing powered by `react-native-reanimated` worklets (UI thread smoothness)
- Offline-first storage using `expo-sqlite`; zero network dependency
- UTC-based data model with robust timezone/DST conversion
- Precomputed day indices for instant month and stats views
- Local notifications for sleep/therapy reminders with deep links
- TypeScript, Jest, and linting baked in; CI runs on push/PR

## Tech Stack
- React Native 0.81 • Expo SDK 54 • TypeScript
- Reanimated v4 • Gesture Handler • Expo Router
- SQLite (expo-sqlite async API) • Zustand
- dayjs with timezone plugin

## Architecture (at a glance)
```
app/                # Screens (Expo Router)
src/
  components/       # UI (e.g., SleepRibbons)
  lib/              # db.ts, time.ts, notifications.ts, prefs.ts
  stores/           # Zustand state
```

## Quick Start
Prereqs: Node 18+, pnpm, Android Studio or Xcode.

```bash
pnpm install
pnpm start
pnpm android   # or: pnpm ios
```

## Scripts
```bash
pnpm lint           # ESLint via Expo config
pnpm test           # Jest
pnpm test:coverage  # Jest coverage
```

## CI
GitHub Actions runs lint and tests on push/PR. See `.github/workflows/ci.yml`.

## Testing
- Unit tests (Jest + babel-jest)
- Targeted coverage for time utilities, formatting, and core components

## Error Monitoring (optional)
Sentry can be enabled for crash and performance monitoring:
1) `pnpm add @sentry/react-native`
2) Initialize in your entry (e.g., `App.tsx`) with your `SENTRY_DSN`
3) Wrap critical try/catch with `Sentry.captureException(...)`

## Screenshots
<p>
  <img src="docs/screenshots/screenshot (1).jpg" alt="screenshot 1" width="45%" />
  <img src="docs/screenshots/screenshot (2).jpg" alt="screenshot 2" width="45%" />
</p>
<p>
  <img src="docs/screenshots/screenshot (3).jpg" alt="screenshot 3" width="45%" />
  <img src="docs/screenshots/screenshot (4).jpg" alt="screenshot 4" width="45%" />
</p>
<p>
  <img src="docs/screenshots/screenshot (5).jpg" alt="screenshot 5" width="45%" />
  <img src="docs/screenshots/screenshot (6).jpg" alt="screenshot 6" width="45%" />
</p>

## Notes
- Primary target: Android; iOS is supported. Web is basic.
- Data stays on device (SQLite). No analytics by default.

—
Built with React Native • Expo • TypeScript • SQLite • Reanimated
