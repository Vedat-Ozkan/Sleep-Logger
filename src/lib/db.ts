// src/lib/db.ts
import dayjs from "dayjs";
import * as SQLite from "expo-sqlite";
import {
  DEVICE_TZ,
  durationMin,
  localDateKeyFromUtcIso,
  makeDateRangeBackwards,
  minutesFromMidnightLocal,
  nowUtcIso,
  splitSegmentByLocalDays,
  todayLocalDate,
} from "./time";

export type TherapyType = "melatonin" | "bright_light";

export type TimeOfDay = { hour: number; minute: number };

export type ReminderPrefs = {
  melatoninEnabled: boolean;
  melatoninTime: TimeOfDay; // local time
  brightEnabled: boolean;
  brightTime: TimeOfDay;
};

export type SegmentKind = "primary" | "nap";
export type SegmentSource = "user" | "notif";

export interface SleepSegment {
  id: string;
  start_utc: string;
  end_utc: string | null; // null = open
  kind: SegmentKind;
  source: SegmentSource;
  notes?: string | null;
  tz_start?: string | null;
  tz_end?: string | null;
  created_at: string;
  updated_at: string;
}

export type SleepSegmentExportRow = Pick<
  SleepSegment,
  "id" | "start_utc" | "end_utc" | "kind" | "source"
>;

export interface DayIndexRow {
  local_date: string; // YYYY-MM-DD
  total_sleep_min: number;
  has_primary: number; // 0/1
  has_naps: number; // 0/1
  last_calc_at: string; // ISO
}

// ---------- DB singleton (expo-sqlite v16 async API) ----------
let _dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!_dbPromise) {
    _dbPromise = SQLite.openDatabaseAsync("sleep-logger.db");
  }
  return _dbPromise;
}

// ---------- Migrations ----------
export async function migrate() {
  const db = await getDb();

  // Some Android environments throw if PRAGMA is in a multi-statement exec or if it returns a row.
  try {
    await db.execAsync("PRAGMA journal_mode = WAL;");
  } catch {
    // ignore – WAL is a perf nicety; not required to function
  }

  // Run each statement separately to avoid native NPEs on some devices
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sleep_segments (
      id TEXT PRIMARY KEY,
      start_utc TEXT NOT NULL,
      end_utc TEXT,
      kind TEXT NOT NULL CHECK (kind IN ('primary','nap')),
      source TEXT NOT NULL CHECK (source IN ('user','notif')),
      notes TEXT,
      tz_start TEXT,
      tz_end TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS day_index (
      local_date TEXT PRIMARY KEY,
      total_sleep_min INTEGER NOT NULL DEFAULT 0,
      has_primary INTEGER NOT NULL DEFAULT 0,
      has_naps INTEGER NOT NULL DEFAULT 0,
      last_calc_at TEXT NOT NULL
    );
  `);

  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_segments_start ON sleep_segments(start_utc);`
  );
  await db.execAsync(
    `CREATE INDEX IF NOT EXISTS idx_segments_end   ON sleep_segments(end_utc);`
  );

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS therapy_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('melatonin','bright_light')),
      at_utc TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('notification','manual')),
      created_at TEXT NOT NULL
    );
  `);
    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS app_prefs (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Optional sanity check (harmless if it fails)
  try {
    await db.getFirstAsync(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='sleep_segments';`
    );
  } catch {
    // ignore
  }
}


// ---------- Utils ----------
function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------- Writes ----------
export async function createOpenPrimary(opts?: {
  source?: SegmentSource;
  notes?: string;
}) {
  const db = await getDb();
  const id = uuid();
  const now = nowUtcIso();
  const src = opts?.source ?? "user";
  const notes = opts?.notes ?? null;

  await db.runAsync(
    `INSERT INTO sleep_segments (id,start_utc,end_utc,kind,source,notes,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [id, now, null, "primary", src, notes, now, now]
  );

  await recomputeDayIndexForUtcInstant(now);
  return id;
}

export async function getOpenPrimary(): Promise<SleepSegment | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<SleepSegment>(
    `SELECT * FROM sleep_segments
     WHERE end_utc IS NULL AND kind='primary'
     ORDER BY start_utc DESC
     LIMIT 1`
  );
  return row ?? null;
}

export async function closeLatestOpenPrimary(opts?: { endUtc?: string }) {
  const db = await getDb();
  const endUtc = opts?.endUtc ?? nowUtcIso();

  const row = await db.getFirstAsync<SleepSegment>(
    `SELECT * FROM sleep_segments
     WHERE end_utc IS NULL AND kind='primary'
     ORDER BY start_utc DESC
     LIMIT 1`
  );

  if (!row) return null;

  await db.runAsync(
    `UPDATE sleep_segments
     SET end_utc=?, updated_at=?
     WHERE id=?`,
    [endUtc, endUtc, row.id]
  );

  await recomputeDayIndexForUtcInstant(row.start_utc);
  await recomputeDayIndexForUtcInstant(endUtc);
  return row.id;
}

export async function upsertSegment(
  seg: Partial<SleepSegment> & { start_utc: string; kind?: SegmentKind }
) {
  const db = await getDb();
  const now = nowUtcIso();
  const id = seg.id ?? uuid();
  const kind = seg.kind ?? "primary";
  const source: SegmentSource = seg.source ?? "user";
  const end_utc = seg.end_utc ?? null;

  const existing = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM sleep_segments WHERE id=?`,
    [id]
  );

  if (existing) {
    await db.runAsync(
      `UPDATE sleep_segments
       SET start_utc=?, end_utc=?, kind=?, source=?, notes=?, tz_start=?, tz_end=?, updated_at=?
       WHERE id=?`,
      [
        seg.start_utc,
        end_utc,
        kind,
        source,
        seg.notes ?? null,
        seg.tz_start ?? null,
        seg.tz_end ?? null,
        now,
        id,
      ]
    );
  } else {
    await db.runAsync(
      `INSERT INTO sleep_segments (id,start_utc,end_utc,kind,source,notes,tz_start,tz_end,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        seg.start_utc,
        end_utc,
        kind,
        source,
        seg.notes ?? null,
        seg.tz_start ?? null,
        seg.tz_end ?? null,
        now,
        now,
      ]
    );
  }

  await recomputeDayIndexForUtcInstant(seg.start_utc);
  if (end_utc) await recomputeDayIndexForUtcInstant(end_utc);
  return id;
}

export async function deleteSegment(id: string) {
  const db = await getDb();
  // We need the segment to recompute affected days
  const seg = await db.getFirstAsync<SleepSegment>(
    `SELECT * FROM sleep_segments WHERE id=?`,
    [id]
  );
  if (!seg) return;

  await db.runAsync(`DELETE FROM sleep_segments WHERE id=?`, [id]);

  // Recompute start (and end if closed)
  await recomputeDayIndexForUtcInstant(seg.start_utc);
  if (seg.end_utc) await recomputeDayIndexForUtcInstant(seg.end_utc);
}

// ---------- Reads ----------
export async function getSegmentsForLocalDate(
  localDate: string
): Promise<SleepSegment[]> {
  const db = await getDb();

  // Local day bounds in the device TZ
  const dayStartLocal = dayjs.tz(
    `${localDate} 00:00`,
    "YYYY-MM-DD HH:mm",
    DEVICE_TZ
  );
  const dayEndLocal = dayStartLocal.add(1, "day");

  // Convert bounds to UTC for querying
  const winStartUtc = dayStartLocal.utc().toISOString();
  const winEndUtc = dayEndLocal.utc().toISOString();

  // Overlap condition:
  // segment [start_utc, end_utc] overlaps window [winStartUtc, winEndUtc) iff:
  //   start_utc < winEndUtc AND (end_utc IS NULL OR end_utc > winStartUtc)
  const rows = await db.getAllAsync<SleepSegment>(
    `SELECT * FROM sleep_segments
     WHERE start_utc < ?
       AND (end_utc IS NULL OR end_utc > ?)
     ORDER BY start_utc ASC`,
    [winEndUtc, winStartUtc]
  );

  return rows ?? [];
}

// ---------- Day index ----------
export async function recomputeDayIndexForUtcInstant(utcIso: string) {
  const dateKey = localDateKeyFromUtcIso(utcIso);
  await recomputeDayIndexForLocalDate(dateKey);
}

export async function recomputeDayIndexForLocalDate(localDate: string) {
  const segs = await getSegmentsForLocalDate(localDate);

  let total = 0;
  let hasPrimary = 0;
  let hasNaps = 0;

  for (const s of segs) {
    if (s.kind === "primary") hasPrimary = 1;
    if (s.kind === "nap") hasNaps = 1;
    if (s.end_utc) total += durationMin(s.start_utc, s.end_utc);
  }

  const db = await getDb();
  const now = nowUtcIso();

  await db.runAsync(
    `INSERT INTO day_index (local_date,total_sleep_min,has_primary,has_naps,last_calc_at)
     VALUES (?,?,?,?,?)
     ON CONFLICT(local_date) DO UPDATE SET
       total_sleep_min=excluded.total_sleep_min,
       has_primary=excluded.has_primary,
       has_naps=excluded.has_naps,
       last_calc_at=excluded.last_calc_at`,
    [localDate, total, hasPrimary, hasNaps, now]
  );
}

export async function getDayIndexRange(
  startLocalDate: string,
  endLocalDate: string
): Promise<DayIndexRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<DayIndexRow>(
    `SELECT * FROM day_index
     WHERE local_date BETWEEN ? AND ?
     ORDER BY local_date ASC`,
    [startLocalDate, endLocalDate]
  );
  return rows ?? [];
}

export const PREF_KEYS = {
  melatoninEnabled: "melatonin_enabled",
  melatoninTime: "melatonin_time",
  brightEnabled: "light_enabled",
  brightTime: "light_time",
  melatoninNotificationId: "melatonin_notif_id",
  brightNotificationId: "light_notif_id",
  defaultSegmentLength: "default_segment_length",
  snapGranularity: "snap_granularity",
} as const;

export const REMINDER_DEFAULTS: ReminderPrefs = {
  melatoninEnabled: false,
  melatoninTime: { hour: 21, minute: 0 },
  brightEnabled: false,
  brightTime: { hour: 7, minute: 0 },
};

export interface EditorPrefs {
  defaultSegmentLengthMin: number;
  snapMinutes: 5;
}

export const DEFAULT_EDITOR_PREFS: EditorPrefs = {
  defaultSegmentLengthMin: 8 * 60,
  snapMinutes: 5,
};

const MIN_SEGMENT_MINUTES = 10;
const MINUTES_PER_DAY = 24 * 60;

function clampTime(value: TimeOfDay | null, fallback: TimeOfDay): TimeOfDay {
  if (!value) return fallback;
  const hour = Number.isFinite(value.hour) ? Math.min(23, Math.max(0, value.hour)) : fallback.hour;
  const minute =
    Number.isFinite(value.minute) ? Math.min(59, Math.max(0, value.minute)) : fallback.minute;
  return { hour, minute };
}

function formatTime({ hour, minute }: TimeOfDay): string {
  const h = String(Math.max(0, Math.min(23, hour))).padStart(2, "0");
  const m = String(Math.max(0, Math.min(59, minute))).padStart(2, "0");
  return `${h}:${m}`;
}

function parseTime(value: string | null, fallback: TimeOfDay): TimeOfDay {
  if (!value) return fallback;
  const [h, m] = value.split(":");
  const hour = Number.parseInt(h ?? "", 10);
  const minute = Number.parseInt(m ?? "", 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return fallback;
  }
  return clampTime({ hour, minute }, fallback);
}

export async function setAppPref(key: string, value: string | null) {
  const db = await getDb();
  if (value === null) {
    await db.runAsync(`DELETE FROM app_prefs WHERE key=?`, [key]);
    return;
  }
  await db.runAsync(
    `INSERT OR REPLACE INTO app_prefs(key,value) VALUES(?,?)`,
    [key, value]
  );
}

export async function getAppPref(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM app_prefs WHERE key=?`,
    [key]
  );
  return row?.value ?? null;
}

export async function saveReminderPrefs(p: ReminderPrefs) {
  const clamped = {
    melatoninEnabled: !!p.melatoninEnabled,
    melatoninTime: clampTime(p.melatoninTime, REMINDER_DEFAULTS.melatoninTime),
    brightEnabled: !!p.brightEnabled,
    brightTime: clampTime(p.brightTime, REMINDER_DEFAULTS.brightTime),
  } satisfies ReminderPrefs;

  await Promise.all([
    setAppPref(PREF_KEYS.melatoninEnabled, clamped.melatoninEnabled ? "1" : "0"),
    setAppPref(PREF_KEYS.melatoninTime, formatTime(clamped.melatoninTime)),
    setAppPref(PREF_KEYS.brightEnabled, clamped.brightEnabled ? "1" : "0"),
    setAppPref(PREF_KEYS.brightTime, formatTime(clamped.brightTime)),
  ]);
}

export async function loadReminderPrefs(): Promise<ReminderPrefs> {
  const [melEnabled, melTime, brightEnabled, brightTime] = await Promise.all([
    getAppPref(PREF_KEYS.melatoninEnabled),
    getAppPref(PREF_KEYS.melatoninTime),
    getAppPref(PREF_KEYS.brightEnabled),
    getAppPref(PREF_KEYS.brightTime),
  ]);

  return {
    melatoninEnabled: melEnabled === "1",
    melatoninTime: parseTime(melTime, REMINDER_DEFAULTS.melatoninTime),
    brightEnabled: brightEnabled === "1",
    brightTime: parseTime(brightTime, REMINDER_DEFAULTS.brightTime),
  } satisfies ReminderPrefs;
}

export async function getReminderNotificationId(
  type: TherapyType
): Promise<string | null> {
  const key =
    type === "melatonin"
      ? PREF_KEYS.melatoninNotificationId
      : PREF_KEYS.brightNotificationId;
  return getAppPref(key);
}

export async function setReminderNotificationId(
  type: TherapyType,
  id: string | null
) {
  const key =
    type === "melatonin"
      ? PREF_KEYS.melatoninNotificationId
      : PREF_KEYS.brightNotificationId;
  await setAppPref(key, id);
}

export async function saveEditorPrefs(p: EditorPrefs) {
  const length = Math.max(
    MIN_SEGMENT_MINUTES,
    Math.min(MINUTES_PER_DAY, p.defaultSegmentLengthMin)
  );

  await setAppPref(PREF_KEYS.defaultSegmentLength, String(Math.round(length)));
}

export async function loadEditorPrefs(): Promise<EditorPrefs> {
  const lengthPref = await getAppPref(PREF_KEYS.defaultSegmentLength);

  const parsedLength = Number.parseInt(lengthPref ?? "", 10);
  const defaultSegmentLengthMin = Number.isFinite(parsedLength)
    ? Math.max(
        MIN_SEGMENT_MINUTES,
        Math.min(MINUTES_PER_DAY, parsedLength)
      )
    : DEFAULT_EDITOR_PREFS.defaultSegmentLengthMin;

  return {
    defaultSegmentLengthMin,
    snapMinutes: 5,
  };
}

export async function insertTherapyEvent(
  type: TherapyType,
  atUtcISO: string,
  source: "notification" | "manual"
) {
  const db = await getDb();
  const now = new Date().toISOString();
  const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  await db.runAsync(
    `INSERT INTO therapy_events(id, type, at_utc, source, created_at) VALUES(?,?,?,?,?)`,
    [id, type, atUtcISO, source, now]
  );
}

// Utility to check if a segment id already exists
export async function segmentExists(id: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM sleep_segments WHERE id=?`,
    [id]
  );
  return !!row;
}

// ---------- Data maintenance ----------
export async function fetchAllSleepSegments(): Promise<SleepSegmentExportRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<SleepSegmentExportRow>(
    `SELECT id, start_utc, end_utc, kind, source FROM sleep_segments ORDER BY start_utc ASC`
  );
  return rows ?? [];
}

type ValidatedImportRow = SleepSegmentExportRow;

function isValidIsoDate(value: string): boolean {
  if (!value) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime());
}

function normalizeImportRow(row: unknown): ValidatedImportRow | null {
  if (!row || typeof row !== "object") return null;
  const candidate = row as Record<string, unknown>;
  const { id, start_utc, end_utc, kind, source } = candidate;
  if (typeof id !== "string" || !id) return null;
  if (typeof start_utc !== "string" || !isValidIsoDate(start_utc)) return null;
  if (end_utc !== null && end_utc !== undefined) {
    if (typeof end_utc !== "string" || !isValidIsoDate(end_utc)) return null;
  }
  if (kind !== "primary" && kind !== "nap") return null;
  if (source !== "user" && source !== "notif") return null;

  return {
    id,
    start_utc,
    end_utc: (end_utc as string | null | undefined) ?? null,
    kind: kind as SegmentKind,
    source: source as SegmentSource,
  };
}

export type ImportResult = {
  attempted: number;
  inserted: number;
  skipped: number;
  invalid: number;
};

export async function importSleepSegments(
  payload: unknown
): Promise<ImportResult> {
  if (!Array.isArray(payload)) {
    throw new Error("Invalid backup format. Expected an array.");
  }

  const db = await getDb();
  const existingRows = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM sleep_segments`
  );
  const existingIds = new Set(existingRows?.map((r) => r.id) ?? []);

  let inserted = 0;
  let invalid = 0;
  const affectedDates = new Set<string>();

  const toInsert: ValidatedImportRow[] = [];
  for (const row of payload) {
    const normalized = normalizeImportRow(row);
    if (!normalized) {
      invalid += 1;
      continue;
    }
    if (existingIds.has(normalized.id)) {
      continue;
    }
    toInsert.push(normalized);
    existingIds.add(normalized.id);
  }

  await db.execAsync("BEGIN TRANSACTION;");
  try {
    for (const row of toInsert) {
      const now = nowUtcIso();
      await db.runAsync(
        `INSERT INTO sleep_segments (id,start_utc,end_utc,kind,source,notes,tz_start,tz_end,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          row.id,
          row.start_utc,
          row.end_utc,
          row.kind,
          row.source,
          null,
          null,
          null,
          now,
          now,
        ]
      );

      affectedDates.add(localDateKeyFromUtcIso(row.start_utc));
      if (row.end_utc) {
        affectedDates.add(localDateKeyFromUtcIso(row.end_utc));
      }
      inserted += 1;
    }
    await db.execAsync("COMMIT;");
  } catch (error) {
    await db.execAsync("ROLLBACK;");
    throw error;
  }

  for (const date of affectedDates) {
    await recomputeDayIndexForLocalDate(date);
  }

  return {
    attempted: payload.length,
    inserted,
    skipped: payload.length - inserted - invalid,
    invalid,
  };
}

export type DailySleepStat = {
  date: string;
  durationMin: number;
};

export interface RecentSleepStats {
  daily: DailySleepStat[];
  avgDurationMin: number;
  avgBedtimeMin: number | null;
  avgWakeMin: number | null;
}

export async function getRecentSleepStats(
  days = 7
): Promise<RecentSleepStats> {
  const today = todayLocalDate();
  const dates = makeDateRangeBackwards(today, days);
  const dateSet = new Set(dates);
  const durationMap = new Map<string, number>();
  dates.forEach((d) => durationMap.set(d, 0));

  const oldestLocalStart = dayjs.tz(dates[0], "YYYY-MM-DD", DEVICE_TZ).startOf("day");
  const oldestUtc = oldestLocalStart.utc().toISOString();

  const db = await getDb();
  const segs = await db.getAllAsync<SleepSegment>(
    `SELECT id, start_utc, end_utc, kind, source
     FROM sleep_segments
     WHERE kind='primary' AND end_utc IS NOT NULL AND end_utc >= ?
     ORDER BY start_utc ASC`,
    [oldestUtc]
  );

  const bedtimeMinutes: number[] = [];
  const wakeMinutes: number[] = [];

  for (const seg of segs ?? []) {
    if (!seg.end_utc) continue;

    const startDate = localDateKeyFromUtcIso(seg.start_utc);
    if (dateSet.has(startDate)) {
      bedtimeMinutes.push(minutesFromMidnightLocal(seg.start_utc));
    }

    const endDate = localDateKeyFromUtcIso(seg.end_utc);
    if (dateSet.has(endDate)) {
      wakeMinutes.push(minutesFromMidnightLocal(seg.end_utc));
    }

    const pieces = splitSegmentByLocalDays(seg.start_utc, seg.end_utc);
    for (const piece of pieces) {
      if (!dateSet.has(piece.date)) continue;
      const minutes = Math.max(
        0,
        dayjs(piece.endLocalIso).diff(dayjs(piece.startLocalIso), "minute")
      );
      if (minutes <= 0) continue;
      durationMap.set(piece.date, (durationMap.get(piece.date) ?? 0) + minutes);
    }
  }

  const daily = dates.map((date) => ({
    date,
    durationMin: durationMap.get(date) ?? 0,
  }));

  const durations = daily.map((d) => d.durationMin).filter((m) => m > 0);
  const avgDurationMin =
    durations.length > 0
      ? Math.round(durations.reduce((sum, m) => sum + m, 0) / durations.length)
      : 0;

  const averageMinutes = (values: number[]): number | null => {
    if (!values.length) return null;
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    return Math.round(mean);
  };

  return {
    daily,
    avgDurationMin,
    avgBedtimeMin: averageMinutes(bedtimeMinutes),
    avgWakeMin: averageMinutes(wakeMinutes),
  };
}

export async function resetSleepData() {
  const db = await getDb();
  await db.execAsync("BEGIN TRANSACTION;");
  try {
    await db.runAsync(`DELETE FROM sleep_segments`);
    await db.runAsync(`DELETE FROM day_index`);
    await db.execAsync("COMMIT;");
  } catch (error) {
    await db.execAsync("ROLLBACK;");
    throw error;
  }
}
