// src/components/SleepRibbons/workletHelpers.ts

// ---------- worklet-safe helpers ----------
export function wClamp(n: number, lo: number, hi: number) {
  "worklet";
  return Math.max(lo, Math.min(hi, n));
}

export function wSnapTo(n: number, step: number) {
  "worklet";
  const s = step > 0 ? step : 1;
  return Math.round(n / s) * s;
}

export function wIsEditingThisColumn(
  isEditing: number,
  activeDayMs: number,
  thisDayMs: number
) {
  "worklet";
  return isEditing === 1 && activeDayMs === thisDayMs;
}

// Check if this column is part of the segment being edited (for multi-day segments)
export function wIsPartOfEditedSegment(
  isEditing: number,
  activeDayMs: number,
  thisDayMs: number,
  startDayOffset: number,
  endDayOffset: number
) {
  "worklet";
  if (isEditing !== 1) return false;

  // Calculate which day this column represents relative to the active day
  const dayDiff = Math.round((thisDayMs - activeDayMs) / 86400000);

  // Check if this day is within the segment's span
  const minOffset = Math.min(startDayOffset, endDayOffset);
  const maxOffset = Math.max(startDayOffset, endDayOffset);

  return dayDiff >= minOffset && dayDiff <= maxOffset;
}

export function wIsNearLimit(value: number, limit: number, threshold: number) {
  "worklet";
  return Math.abs(value - limit) < threshold;
}

export function wMinutesToHm24(min: number) {
  "worklet";
  const normalized = Math.max(0, min) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = Math.round(normalized % 60);
  const hh = h < 10 ? `0${h}` : `${h}`;
  const mm = m < 10 ? `0${m}` : `${m}`;
  return `${hh}:${mm}`;
}

export function wMinutesToHm12(min: number) {
  "worklet";
  const normalized = Math.max(0, min) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = Math.round(normalized % 60);
  const am = h < 12;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const mm = m < 10 ? `0${m}` : `${m}`;
  return `${hour12}:${mm} ${am ? "AM" : "PM"}`;
}
