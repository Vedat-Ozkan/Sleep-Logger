# n24 Logger

A production-ready React Native sleep tracking application with advanced gesture-based visualization and intelligent reminder system, built for non-24-hour sleep-wake disorder management.

## 🎯 Overview

n24 Logger provides precise sleep segment tracking with a sophisticated timeline-based UI, enabling users to log sleep patterns, schedule therapy reminders (melatonin/bright light), and analyze sleep data across time zones. The app features real-time gesture editing, performant animations, and robust offline-first architecture.

## ✨ Key Features

### Advanced Sleep Visualization
- **Interactive Timeline UI**: Horizontal scrollable timeline with gesture-based editing using react-native-reanimated worklets
- **Real-time Editing**: Long-press to create segments, drag handles to adjust times—all running on the UI thread for 60fps performance
- **Cross-midnight Handling**: Intelligent segment clamping for sleep periods that span day boundaries
- **Overlap Prevention**: Built-in validation prevents conflicting sleep segments

### Intelligent Time Management
- **UTC Storage with Local Display**: All timestamps stored in UTC, automatically converted to device timezone for display
- **Day Index Optimization**: Pre-computed daily aggregates (total sleep, primary/nap counts) for performant calendar rendering
- **Timezone-aware Calculations**: Handles DST transitions and timezone changes correctly

### Therapy Reminder System
- **Calendar-based Scheduling**: Weekly recurring reminders with exact time specification
- **Deep-linked Actions**: Notifications open directly to therapy logging screen
- **Multi-type Support**: Separate tracking for melatonin and bright light therapy

## 🏗️ Technical Architecture

### Stack
- **React Native 0.81.4** with **Expo SDK 54**
- **TypeScript** (strict mode) with path aliases
- **expo-router v6** for type-safe file-based routing
- **expo-sqlite v16** (async API) for local-first data storage
- **Zustand** for predictable state management
- **react-native-reanimated v4** with worklets for high-performance animations
- **dayjs** with timezone support for temporal logic

### Database Design

SQLite schema with three core tables:

```sql
-- Sleep segment tracking with UTC timestamps
sleep_segments (id, utc_start, utc_end, kind, source)

-- Pre-computed daily aggregates for performance
day_index (local_date, total_sleep_min, has_primary, has_naps)

-- Therapy event log
therapy_events (id, utc_timestamp, type)

-- User preferences
app_prefs (key, value)
```

**Key pattern**: Every write triggers automatic day_index recomputation for affected dates, ensuring calendar UI remains fast even with thousands of entries.

### Performance Optimizations

1. **UI Thread Gesture Handling**: All drag/long-press logic runs via reanimated worklets, avoiding JS bridge bottleneck
2. **Incremental Day Index**: Only affected dates are recomputed on segment changes
3. **Virtualized Lists**: FlatList with proper keys for efficient scrolling
4. **Memoized Calculations**: Time conversions and formatting cached where appropriate

### Critical Code Patterns

#### Worklet Safety
```typescript
// UI thread-safe gesture handlers
const handleDrag = useAnimatedGestureHandler({
  onActive: (event) => {
    'worklet'
    // Runs on UI thread - no React state access
    position.value = event.translationY
  },
  onEnd: () => {
    'worklet'
    // Bridge back to JS thread for state updates
    scheduleOnRN(() => commitChanges())
  }
})
```

#### Time Zone Handling
```typescript
// Always store UTC, convert for display
const utcTime = nowUtcIso()  // "2025-01-15T08:30:00Z"
const localTime = utcIsoToLocal(utcTime)  // dayjs in device TZ
const displayTime = fmtLocalHM(utcTime)  // "03:30 AM" (local)
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and pnpm
- Expo CLI
- Android Studio (for Android) or Xcode (for iOS)

### Installation

```bash
# Clone repository
git clone <repository-url>
cd n24

# Install dependencies
pnpm install

# Start development server
pnpm start

# Run on platform
pnpm run android
pnpm run ios
```

### Development

```bash
# Linting
pnpm run lint

# Type checking
pnpm run check-types
```

## 📁 Project Structure

```
app/
├── _layout.tsx          # Root layout with initialization
├── index.tsx            # Entry point (redirects to /log)
├── (tabs)/              # Tab navigation group
│   ├── log.tsx          # Sleep segment editor
│   ├── calendar.tsx     # Historical view
│   ├── reminders.tsx    # Therapy reminder config
│   └── settings.tsx     # App preferences
└── therapy.tsx          # Deep-linked therapy action

src/
├── lib/
│   ├── db.ts            # SQLite schema and queries
│   ├── time.ts          # UTC/local conversion utilities
│   └── notifications.ts # Reminder scheduling system
├── components/
│   └── SleepRibbons.tsx # Gesture-based timeline UI
└── stores/              # Zustand state management
```

## 🔄 App Initialization Flow

The startup sequence in `app/_layout.tsx` follows a critical order:

1. **Database Migration** - Create tables and indices
2. **Notification Setup** - Request permissions, configure Android channel
3. **Load Preferences** - Retrieve reminder settings
4. **Schedule Reminders** - Set up weekly notifications if enabled
5. **Register Listeners** - Handle deep-link responses from notifications

This sequence ensures dependencies are satisfied (e.g., notifications require DB schema).

## 🎨 UI/UX Highlights

- **Native Feel**: Platform-specific components and interactions
- **Gesture-driven**: Intuitive long-press and drag editing
- **Responsive**: Smooth 60fps animations via worklets
- **Accessible**: Proper hit targets and feedback
- **Offline-first**: All data stored locally, no network dependency

## 🛠️ Technical Challenges Solved

1. **Cross-timezone Consistency**: Robust UTC storage prevents ambiguity when users travel
2. **Midnight Boundary Handling**: Sleep segments correctly span across day boundaries
3. **Gesture Performance**: Worklet architecture eliminates jank during editing
4. **Calendar Efficiency**: Day index pre-computation enables instant month-view rendering
5. **Notification Deep-linking**: Proper initialization sequence ensures notifications work reliably

## 📱 Platform Support

- **Primary**: Android (see `app.json` platforms configuration)
- **Secondary**: iOS (compatible but not primary focus)
- **Web**: Basic support via Expo web (limited gesture support)

## 🔐 Data Privacy

All data stored locally on device via SQLite. No cloud sync, no analytics, no network requests. Complete user privacy and control.

## 📄 License

[Specify license here]

## 🤝 Contributing

[Contribution guidelines if open source]

---

**Built with**: React Native • Expo • TypeScript • SQLite • Reanimated

*Developed as a specialized tool for non-24-hour sleep-wake disorder management, showcasing production-ready mobile development patterns and advanced React Native techniques.*
