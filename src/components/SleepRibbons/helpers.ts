// src/components/SleepRibbons/helpers.ts

// ---------- JS helpers (DO NOT mark "worklet") ----------
// Safer date construction - explicit timezone handling
// Supports multi-day segments: mins can be negative or > 1440
export function localDateFromDayAndMinutes(dayKey: string, mins: number): Date {
  // Parse the date key
  const [year, month, day] = dayKey.split("-").map(Number);

  // Calculate hours and minutes
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;

  // Create a Date in LOCAL timezone (not UTC!)
  // JavaScript Date constructor in the form new Date(year, month, day, hours, minutes)
  // treats the input as LOCAL time
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);

  return date;
}
