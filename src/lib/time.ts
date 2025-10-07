// src/lib/time.ts
import dayjs from "dayjs";
import minMax from "dayjs/plugin/minMax";
import tz from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(tz);
dayjs.extend(minMax);

// Change if you want to pin a TZ; by default use device time zone.
export const DEVICE_TZ = dayjs.tz.guess();
console.log(`[time.ts] DEVICE_TZ detected as: ${DEVICE_TZ}`);

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
  return dayjs().tz(DEVICE_TZ).format("YYYY-MM-DD");
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
  const h = Math.floor(normalized / 60);
  const m = Math.round(normalized % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function minutesToHmPref(min: number, clock24h: boolean) {
  const normalized = Math.max(0, min) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = Math.round(normalized % 60);
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
  const end = dayjs.tz(endInclusive, "YYYY-MM-DD", DEVICE_TZ);
  const start = end.subtract(days - 1, "day");
  const arr: string[] = [];
  for (let i = 0; i < days; i++) {
    arr.push(start.add(i, "day").format("YYYY-MM-DD"));
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
