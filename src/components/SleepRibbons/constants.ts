// src/components/SleepRibbons/constants.ts

import { colors } from "@/src/theme/colors";

// ---------- layout constants ----------
export const LABEL_H = 24;
export const HANDLE_SIZE = 20; // Visual height of handle
export const HANDLE_TOUCH_SIZE = 48; // Touch target height (accessibility minimum)
export const MIN_DURATION = 60; // minutes (min segment dur for edit & create)
export const DEFAULT_CREATE_MINUTES = 8 * 60;
export const DEFAULT_SNAP_MINUTES = 5;
export const MIN_CREATE_MINUTES = 60; // minimum duration when creating a new segment
export const MINUTES_PER_DAY = 1440;
export const HOURS_PER_DAY = 24;

// Visual feedback thresholds
export const LONG_PRESS_DURATION = 250; // ms

export const COLORS = {
  axis: colors.textSecondary,
  border: colors.borderPrimary,
  todayBg: "rgba(16,185,129,0.06)", // accentGreen @ ~6%
  todayIndicator: colors.accentGreen,
  // Softer mint ribbons on dark background
  segmentBase: "rgba(110,231,183,0.28)", // mint @ 28%
  segmentFocused: "rgba(110,231,183,0.44)", // mint @ 44%
  segmentBorder: colors.accentMint,
  handleNormal: colors.accentMint,
  handleWarning: "#fbbf24", // amber 400
  deleteButton: colors.dangerRed,
  text: colors.textPrimary,
  white: colors.white,
  // Midnight boundary and time labels
  midnightBoundary: "rgba(156,163,175,0.3)", // textSecondary @ 30%
  midnightBoundaryActive: "rgba(110,231,183,0.6)", // mint @ 60%
  dayBadge: colors.accentBlue,
} as const;
