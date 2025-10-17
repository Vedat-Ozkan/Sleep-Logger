// src/lib/time.ts
import dayjs from "dayjs";
import minMax from "dayjs/plugin/minMax";
import tz from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(tz);
dayjs.extend(minMax);

// Change if you want to pin a TZ; by default use device time zone.
// Prefer the device's local timezone reported by the JS runtime.
// Fall back to dayjs guess as a best effort.
function _detectDeviceTz(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof tz === 'string' && tz.length > 0) return tz;
  } catch {}
  try {
    const guess = dayjs.tz.guess();
    if (typeof guess === 'string' && guess.length > 0) return guess;
  } catch {}
  return 'UTC';
}

export const DEVICE_TZ = _detectDeviceTz();
// Log in development only to reduce noise in production
// eslint-disable-next-line no-undef
if (typeof __DEV__ !== 'undefined' && __DEV__) {
  // eslint-disable-next-line no-console
  console.log(`[time.ts] DEVICE_TZ detected as: ${DEVICE_TZ}`);
}

/** ISO string in UTC now */
export function nowUtcIso(): string {
  return dayjs.utc().toISOString();
}

/** Ensure an ISO string is treated as UTC (returns ISO again) */
export function toUtcIso(d: string | Date | number): string {
  return dayjs(d).utc().toISOString();
}

/** Convert a UTC ISO to local time Dayjs */
export function utcIsoToLocal(iso: string) {
  // Parse the UTC ISO string to a Date object
  // JavaScript Date automatically converts to local timezone when formatting
  const date = new Date(iso);

  // Create a dayjs object from the Date (which is now in local time context)
  const result = dayjs(date);

  return result;
}

/** Format helpers */
export function fmtLocalHM(isoUtc: string) {
  return utcIsoToLocal(isoUtc).format("HH:mm");
}
export function fmtLocalDate(isoUtc: string) {
  return utcIsoToLocal(isoUtc).format("YYYY-MM-DD");
}

// ---------- Time-of-day helpers (HH:mm) ----------
export type TimeOfDay = { hour: number; minute: number };

/** Clamp a time-of-day to 00:00–23:59, falling back if input is invalid */
export function clampTimeOfDay(
  value: Partial<TimeOfDay> | null | undefined,
  fallback: TimeOfDay
): TimeOfDay {
  if (!value || !Number.isFinite(value.hour as number) || !Number.isFinite(value.minute as number)) {
    return fallback;
  }
  const hour = Math.min(23, Math.max(0, Math.trunc(value.hour as number)));
  const minute = Math.min(59, Math.max(0, Math.trunc(value.minute as number)));
  return { hour, minute };
}

/** Parse an "HH:mm" string with fallback and clamping */
export function parseHm(value: string | null | undefined, fallback: TimeOfDay): TimeOfDay {
  if (!value) return fallback;
  const [h, m] = String(value).split(":");
  const hour = Number.parseInt(h ?? "", 10);
  const minute = Number.parseInt(m ?? "", 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return fallback;
  return clampTimeOfDay({ hour, minute }, fallback);
}

/** Format a time-of-day to "HH:mm" */
export function hmToString(t: TimeOfDay): string {
  const h = String(Math.min(23, Math.max(0, t.hour))).padStart(2, "0");
  const m = String(Math.min(59, Math.max(0, t.minute))).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Apply phase shift to a base time
 * @param baseTime - Original time (e.g., 21:00)
 * @param shiftMinutesPerDay - Minutes to shift per day (positive=later, negative=earlier)
 * @param daysElapsed - Number of days since phase shift started
 * @returns Shifted time wrapped to 24-hour format
 */
export function calculatePhaseShiftedTime(
  baseTime: TimeOfDay,
  shiftMinutesPerDay: number,
  daysElapsed: number
): TimeOfDay {
  // Convert to total minutes from midnight
  const baseMinutes = baseTime.hour * 60 + baseTime.minute;

  // Calculate total shift
  const totalShift = shiftMinutesPerDay * daysElapsed;

  // Apply shift and wrap to 24-hour format
  let shiftedMinutes = baseMinutes + totalShift;

  // Handle wraparound (both positive and negative)
  const MINUTES_PER_DAY = 24 * 60;
  shiftedMinutes = ((shiftedMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

  // Convert back to hour:minute
  const hour = Math.floor(shiftedMinutes / 60);
  const minute = shiftedMinutes % 60;

  return { hour, minute };
}

/** Returns local date key YYYY-MM-DD for a given UTC instant */
export function localDateKeyFromUtcIso(isoUtc: string): string {
  return fmtLocalDate(isoUtc);
}

/** Split a UTC segment across local “calendar days” for rendering.
 * Returns an array of pieces each constrained to a local date.
 */
export function splitSegmentByLocalDays(startUtc: string, endUtc: string) {
  const startLocal = utcIsoToLocal(startUtc);
  const endLocal = utcIsoToLocal(endUtc);
  const parts: { date: string; startLocalIso: string; endLocalIso: string }[] =
    [];

  let cur = startLocal.startOf("day");
  let cursor = startLocal;

  while (cursor.isBefore(endLocal)) {
    const dayEnd = cur.add(1, "day");
    const segEnd = endLocal.isBefore(dayEnd) ? endLocal : dayEnd;

    parts.push({
      date: cursor.format("YYYY-MM-DD"),
      startLocalIso: cursor.toISOString(),
      endLocalIso: segEnd.toISOString(),
    });

    cur = dayEnd.startOf("day");
    cursor = segEnd;
  }

  return parts;
}

/** Duration in minutes between two UTC ISO instants */
export function durationMin(startUtc: string, endUtc: string): number {
  const a = dayjs.utc(startUtc);
  const b = dayjs.utc(endUtc);
  return Math.max(0, b.diff(a, "minute"));
}

export function todayLocalDate(): string {
  // Use the device's local clock rather than converting via a guessed TZ name
  // to avoid off-by-one-day errors when tz guess is inaccurate in RN.
  return dayjs().format("YYYY-MM-DD");
}

export function addDaysLocal(dateKey: string, days: number): string {
  return dayjs
    .tz(dateKey, "YYYY-MM-DD", DEVICE_TZ)
    .add(days, "day")
    .format("YYYY-MM-DD");
}

/** Friendly duration like "7h 42m" */
export function fmtDurationMin(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

export function minutesToHm(min: number) {
  const normalized = Math.max(0, min) % (24 * 60);
  const total = Math.round(normalized);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function minutesToHmPref(min: number, clock24h: boolean) {
  const normalized = Math.max(0, min) % (24 * 60);
  const total = Math.round(normalized);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (clock24h) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const am = h < 12;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(m).padStart(2, '0');
  return `${hour12}:${mm} ${am ? 'AM' : 'PM'}`;
}

export function monthStart(dateKey: string) {
  return dayjs.tz(dateKey, "YYYY-MM-DD", DEVICE_TZ).startOf("month");
}
export function monthName(dateKey: string) {
  return dayjs.tz(dateKey, "YYYY-MM-DD", DEVICE_TZ).format("MMMM YYYY");
}
export function visibleGridRange(dateKey: string) {
  // Start from Sunday (or change to Monday by .isoWeekday(1) if you prefer)
  const mStart = monthStart(dateKey);
  const gridStart = mStart.startOf("week"); // Sunday
  const gridEnd = gridStart.add(6 * 7 - 1, "day"); // 6 weeks * 7 days
  return {
    startLocalDate: gridStart.format("YYYY-MM-DD"),
    endLocalDate: gridEnd.format("YYYY-MM-DD"),
    dates: Array.from({ length: 42 }, (_, i) =>
      gridStart.add(i, "day").format("YYYY-MM-DD")
    ),
  };
}
export function isSameLocalDay(a: string, b: string) {
  return a === b;
}
export function isSameMonth(dateKey: string, other: string) {
  const a = dayjs.tz(dateKey, "YYYY-MM-DD", DEVICE_TZ);
  const b = dayjs.tz(other, "YYYY-MM-DD", DEVICE_TZ);
  return a.month() === b.month() && a.year() === b.year();
}

export function minutesFromMidnightLocal(isoUtc: string) {
  const d = utcIsoToLocal(isoUtc);
  return d.hour() * 60 + d.minute();
}

export function makeDateRangeBackwards(endInclusive: string, days: number) {
  // returns array oldest→newest (chronological)
  // Build using native Date in local time to avoid incorrect TZ name issues
  const [y, m, d] = endInclusive.split('-').map(Number);
  const end = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(end.getDate() - (days - 1));
  const arr: string[] = [];
  for (let i = 0; i < days; i++) {
    const cur = new Date(start);
    cur.setDate(start.getDate() + i);
    const yy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, '0');
    const dd = String(cur.getDate()).padStart(2, '0');
    arr.push(`${yy}-${mm}-${dd}`);
  }
  return arr;
}

export function shortMonthDay(dateKey: string) {
  return dayjs.tz(dateKey, "YYYY-MM-DD", DEVICE_TZ).format("MMM D"); // e.g., "Oct 13"
}

export function localHmToUtcIso(localDateKey: string, hm: string) {
  // hm: "HH:mm"
  return dayjs
    .tz(`${localDateKey} ${hm}`, "YYYY-MM-DD HH:mm", DEVICE_TZ)
    .utc()
    .toISOString();
}

/** Construct a local Date from a YYYY-MM-DD day key and minutes from midnight.
 * Supports minutes outside 0..1440 (will roll days accordingly).
 */
export function localDateFromDayAndMinutes(dayKey: string, minutesFromMidnight: number): Date {
  const [year, month, day] = dayKey.split("-").map(Number);
  const hours = Math.trunc(minutesFromMidnight / 60);
  const minutes = Math.trunc(minutesFromMidnight % 60);
  return new Date(year, (month ?? 1) - 1, day ?? 1, hours, minutes, 0, 0);
}

export function clampSegmentToLocalDay(
  dateKey: string,
  startUtc: string,
  endUtc: string | null
): { startMin: number; endMin: number } | null {
  // Parse day key to create local midnight
  const [year, month, day] = dateKey.split("-").map(Number);
  const dayStartDate = new Date(year, month - 1, day, 0, 0, 0, 0);
  const dayEndDate = new Date(year, month - 1, day + 1, 0, 0, 0, 0);

  // Convert UTC to local Date objects
  const segStartDate = new Date(startUtc);
  const segEndDate = endUtc ? new Date(endUtc) : dayEndDate;

  // Clamp to day boundaries
  const startClamped = segStartDate > dayStartDate ? segStartDate : dayStartDate;
  const endClamped = segEndDate < dayEndDate ? segEndDate : dayEndDate;

  if (endClamped <= startClamped) return null;

  // Calculate minutes from day start
  const startMin = Math.floor((startClamped.getTime() - dayStartDate.getTime()) / 60000);
  let endMin = Math.floor((endClamped.getTime() - dayStartDate.getTime()) / 60000);

  // If segment ends exactly at midnight (next day), clamp to 23:59 for rendering
  if (endMin >= 1440) {
    endMin = 1439;
  }

  return { startMin, endMin };
}

export function toUtcIsoFromLocal(date: Date) {
  return dayjs(date).utc().toISOString();
}

export function fromUtcIsoToLocalDate(isoUtc: string) {
  return utcIsoToLocal(isoUtc).toDate();
}


export function yToMinutes(y: number, columnHeight: number) {
  const m = (1 - y / columnHeight) * 1440;
  return Math.max(0, Math.min(1440, m));
}

export function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
