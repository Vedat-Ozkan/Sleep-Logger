# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**n24 logger** is a React Native app for tracking sleep segments and therapy reminders (melatonin/bright light), built with Expo SDK 54. The app is primarily targeted at Android (see `app.json` platforms array).

## Tech Stack

- **Framework**: React Native 0.81.4 with Expo SDK 54
- **Language**: TypeScript (strict mode enabled)
- **Routing**: expo-router v6 (file-based routing with typed routes)
- **Database**: expo-sqlite v16 (async API)
- **State**: Zustand for global state
- **Animations**: react-native-reanimated v4 with worklets
- **Time**: dayjs with timezone support
- **Package Manager**: pnpm

## Development Commands

```bash
# Start development server
pnpm start

# Run on specific platforms
pnpm run android
pnpm run ios
pnpm run web

# Linting
pnpm run lint
```

## Architecture

### File-based Routing

The app uses expo-router with the following structure:
- `app/_layout.tsx` - Root layout with initialization logic
- `app/index.tsx` - Entry point (redirects to `/log`)
- `app/(tabs)/` - Tab navigation group (log, calendar, reminders, settings)
- `app/therapy.tsx` - Therapy action screen (deep-linked from notifications)

### Database Layer (`src/lib/db.ts`)

**Core principle**: All timestamps are stored in UTC, converted to device timezone for display.

Key tables:
- `sleep_segments` - Sleep tracking with start/end times, kind (primary/nap), source (user/notif)
- `day_index` - Aggregated daily stats (total_sleep_min, has_primary, has_naps) for performance
- `therapy_events` - Melatonin/bright light event log
- `app_prefs` - Key-value store for settings (e.g., reminder preferences)

Important patterns:
- Every write operation that touches sleep segments calls `recomputeDayIndexForUtcInstant()` to update the day_index
- Use `migrate()` function to initialize schema (runs on app startup in `_layout.tsx`)
- Database singleton via async `getDb()` - don't create multiple instances

### Time Handling (`src/lib/time.ts`)

**Critical pattern**: The app uses UTC for storage and local timezone for display.

Key functions:
- `nowUtcIso()` - Current time in UTC ISO format
- `utcIsoToLocal(iso)` - Convert UTC to local dayjs object
- `localDateKeyFromUtcIso(iso)` - Extract YYYY-MM-DD in local timezone
- `clampSegmentToLocalDay()` - Used for rendering segments that cross midnight

The device timezone is detected via `dayjs.tz.guess()` and stored in `DEVICE_TZ`.

### Notification System (`src/lib/notifications.ts`)

Handles therapy reminders with the following flow:
1. `initNotifications()` requests permissions and sets up Android channel (must run after DB migration)
2. `scheduleFromPrefs(prefs)` schedules weekly calendar-based notifications
3. Notifications include deep-link data (`action: "therapy", type: "melatonin"|"bright_light"`)
4. App startup (in `_layout.tsx`) follows this sequence:
   - `migrate()` - Initialize database
   - `initNotifications()` - Request permissions, setup channels
   - Load reminder prefs and call `scheduleFromPrefs()` if enabled
   - Register notification response listener for deep-linking

### Sleep Visualization (`src/components/SleepRibbons.tsx`)

A complex component using react-native-reanimated worklets for performant gesture-based editing:
- Horizontal FlatList of day columns
- Each column shows 24-hour timeline (midnight at bottom)
- Long-press to create new sleep segment or edit existing
- Pan gestures on handles to adjust start/end times
- All gesture logic runs on UI thread via worklets
- `useSleepEditor` hook manages edit state with automatic commit on changes
- Overlap detection prevents conflicting segments

**Important**: Functions marked `"worklet"` run on UI thread and cannot access JS state directly - use `scheduleOnRN()` to call back to JS thread.

### App Initialization Flow

See `app/_layout.tsx` for the critical startup sequence:
1. Database migration (creates tables)
2. Notification initialization (requires DB)
3. Load reminder preferences
4. Schedule notifications if enabled
5. Set up notification response listener

This sequence must run in order - notifications depend on DB being ready.

## Important Patterns

### Path Aliases

TypeScript is configured with `@/*` alias mapping to project root:
```typescript
import { db } from '@/src/lib/db'
```

### Worklet Safety

When using react-native-reanimated:
- Mark functions that need UI thread access with `"worklet"` directive
- Don't access React state or non-worklet functions from worklets
- Use `scheduleOnRN()` to call JS functions from worklets
- Shared values (`useSharedValue`) are thread-safe

### Time Zone Handling

Always:
- Store times in UTC (`nowUtcIso()`, `toUtcIso()`)
- Convert to local for display (`utcIsoToLocal()`, `fmtLocalHM()`)
- Use `localDateKeyFromUtcIso()` for day bucketing
