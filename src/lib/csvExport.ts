// src/lib/csvExport.ts
// CSV import/export for sleep data
// Format compatible with common N24 sleep tracking apps (SleepChart, etc.)

import { fetchAllSleepSegments, segmentExists, upsertSegment } from "@/src/lib/db";
import { DEVICE_TZ, utcIsoToLocal } from "@/src/lib/time";
import dayjs from "dayjs";

// Standard CSV format for N24 sleep tracking:
// Date,Start,End,EndDate,Duration
// YYYY-MM-DD,HH:MM,HH:MM,YYYY-MM-DD,minutes

export interface CsvRow {
  date: string;      // YYYY-MM-DD (local date when sleep started)
  start: string;     // HH:MM (local time)
  end: string;       // HH:MM (local time)
  endDate: string;   // YYYY-MM-DD (local date when sleep ended)
  duration: number;  // minutes
}

/**
 * Convert sleep segments to CSV string
 */
export async function exportToCSV(): Promise<string> {
  const segments = await fetchAllSleepSegments();

  // CSV header
  const lines = ['Date,Start,End,EndDate,Duration'];

  for (const seg of segments) {
    if (!seg.end_utc) continue; // Skip open segments

    const startLocal = utcIsoToLocal(seg.start_utc);
    const endLocal = utcIsoToLocal(seg.end_utc);

    const startDate = startLocal.format('YYYY-MM-DD');
    const endDate = endLocal.format('YYYY-MM-DD');
    const startTime = startLocal.format('HH:mm');
    const endTime = endLocal.format('HH:mm');
    const duration = endLocal.diff(startLocal, 'minute');

    lines.push(`${startDate},${startTime},${endTime},${endDate},${duration}`);
  }

  return lines.join('\n');
}

/**
 * Parse CSV string and import sleep segments
 */
export async function importFromCSV(csvContent: string): Promise<{
  inserted: number;
  updated: number;
  invalid: number;
}> {
  const lines = csvContent.split('\n').map(l => l.trim()).filter(Boolean);

  // Skip header if present
  const dataLines = lines[0]?.toLowerCase().includes('date')
    ? lines.slice(1)
    : lines;

  let inserted = 0;
  let updated = 0;
  let invalid = 0;

  for (const line of dataLines) {
    try {
      const row = parseCSVLine(line);
      if (!row) {
        invalid++;
        continue;
      }
      // Normalize inputs
      const pad2 = (n: number) => String(n).padStart(2, "0");
      const [sH, sM] = row.start.split(":").map((n) => Number.parseInt(n, 10));
      const [eH, eM] = row.end.split(":").map((n) => Number.parseInt(n, 10));
      if (!Number.isFinite(sH) || !Number.isFinite(sM) || !Number.isFinite(eH) || !Number.isFinite(eM)) {
        invalid++;
        continue;
      }
      if (sH < 0 || sH > 23 || sM < 0 || sM > 59 || eH < 0 || eH > 23 || eM < 0 || eM > 59) {
        invalid++;
        continue;
      }

      const startLocal = dayjs.tz(`${row.date} ${pad2(sH)}:${pad2(sM)}`, "YYYY-MM-DD HH:mm", DEVICE_TZ);

      let endLocal: dayjs.Dayjs;
      if (row.duration && row.duration > 0) {
        // Trust duration if provided
        endLocal = startLocal.add(row.duration, "minute");
      } else {
        // Use provided end time/date
        const endDateStr = row.endDate || row.date;
        const candidate = dayjs.tz(`${endDateStr} ${pad2(eH)}:${pad2(eM)}`, "YYYY-MM-DD HH:mm", DEVICE_TZ);
        // If no endDate given and time goes "past midnight", roll to next day
        if (!row._endDateProvided && candidate.isBefore(startLocal)) {
          endLocal = candidate.add(1, "day");
        } else {
          endLocal = candidate;
        }
      }

      const startUtc = startLocal.utc().toISOString();
      const endUtc = endLocal.utc().toISOString();

      // Generate unique ID from start time
      const id = `imported-${startUtc}`;

      // Determine if this will insert or update (by id)
      const existed = await segmentExists(id);

      // Use upsertSegment to insert or update
      await upsertSegment({
        id,
        start_utc: startUtc,
        end_utc: endUtc,
        kind: 'primary',
        source: 'user',
      });

      if (existed) updated++; else inserted++;

      // upsertSegment recomputes day index internally

    } catch (err) {
      console.error('Error importing CSV row:', line, err);
      invalid++;
    }
  }

  return { inserted, updated, invalid };
}

/**
 * Parse a single CSV line, handling quoted fields
 */
type ParsedRow = CsvRow & { _endDateProvided?: boolean };

function parseCSVLine(line: string): ParsedRow | null {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current.trim());

  if (parts.length < 3) return null; // require at least Date,Start,End

  // Accept 3-5 columns: Date,Start,End,(EndDate|Duration),(Duration)
  const [date, start, end, fourth, fifth] = parts;

  // Validate date format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  // Validate time format HH:MM
  if (!/^\d{1,2}:\d{2}$/.test(start) || !/^\d{1,2}:\d{2}$/.test(end)) return null;

  let endDate: string | undefined;
  let duration: number | undefined;
  let endDateProvided = false;

  if (parts.length >= 4) {
    // Heuristic: prefer YYYY-MM-DD as fourth; otherwise treat as duration
    if (fourth && /^\d{4}-\d{2}-\d{2}$/.test(fourth)) {
      endDate = fourth;
      endDateProvided = true;
      if (parts.length >= 5) {
        const d = Number.parseInt(fifth ?? '', 10);
        if (Number.isFinite(d)) duration = d;
      }
    } else {
      const d = Number.parseInt(fourth ?? '', 10);
      if (Number.isFinite(d)) duration = d;
      if (parts.length >= 5 && fifth && /^\d{4}-\d{2}-\d{2}$/.test(fifth)) {
        endDate = fifth;
        endDateProvided = true;
      }
    }
  }

  return {
    date,
    start,
    end,
    endDate: endDate ?? date,
    duration: duration ?? 0,
    _endDateProvided: endDateProvided,
  };
}
