import {
  clampTimeOfDay,
  parseHm,
  hmToString,
  minutesToHm,
  minutesToHmPref,
  makeDateRangeBackwards,
  localDateFromDayAndMinutes,
  localHmToUtcIso,
  clampSegmentToLocalDay,
  localDateKeyFromUtcIso,
  minutesFromMidnightLocal,
} from './time';

describe('time.ts core helpers', () => {
  test('clampTimeOfDay and HM parse/format', () => {
    const fb = { hour: 9, minute: 30 };
    expect(clampTimeOfDay({ hour: 25, minute: 99 }, fb)).toEqual({ hour: 23, minute: 59 });
    expect(clampTimeOfDay({ hour: -1, minute: -10 }, fb)).toEqual({ hour: 0, minute: 0 });
    expect(clampTimeOfDay(null as any, fb)).toEqual(fb);

    const t = parseHm('07:05', { hour: 0, minute: 0 });
    expect(t).toEqual({ hour: 7, minute: 5 });
    expect(hmToString(t)).toBe('07:05');
  });

  test('minutesToHm and minutesToHmPref', () => {
    expect(minutesToHm(0)).toBe('00:00');
    expect(minutesToHm(60)).toBe('01:00');
    expect(minutesToHm(1439)).toBe('23:59');

    expect(minutesToHmPref(780, true)).toBe('13:00'); // 13:00
    const twelve = minutesToHmPref(13 * 60 + 5, false);
    expect(['1:05 PM', '1:05 PM']).toContain(twelve);
  });

  test('makeDateRangeBackwards builds chronological days', () => {
    const days = makeDateRangeBackwards('2025-01-10', 3);
    expect(days).toEqual(['2025-01-08', '2025-01-09', '2025-01-10']);
  });

  test('localDateFromDayAndMinutes rolls across days', () => {
    const d1 = localDateFromDayAndMinutes('2025-01-01', 1500); // 25h -> Jan 2 01:00
    expect(d1.getFullYear()).toBe(2025);
    expect(d1.getMonth()).toBe(0);
    expect(d1.getDate()).toBe(2);
    expect(d1.getHours()).toBe(1);
    expect(d1.getMinutes()).toBe(0);

    const d2 = localDateFromDayAndMinutes('2025-01-02', -60); // -1h -> Jan 1 23:00
    expect(d2.getDate()).toBe(1);
    expect(d2.getHours()).toBe(23);
  });

  test('clampSegmentToLocalDay round-trips local HM', () => {
    const startUtc = localHmToUtcIso('2025-03-10', '10:00');
    const endUtc = localHmToUtcIso('2025-03-10', '12:30');
    const clamped = clampSegmentToLocalDay('2025-03-10', startUtc, endUtc)!;
    expect(clamped.startMin).toBe(10 * 60);
    expect(clamped.endMin).toBe(12 * 60 + 30);
  });

  test('localDateKeyFromUtcIso and minutesFromMidnightLocal are consistent', () => {
    const sUtc = localHmToUtcIso('2025-03-11', '06:45');
    expect(localDateKeyFromUtcIso(sUtc)).toBe('2025-03-11');
    expect(minutesFromMidnightLocal(sUtc)).toBe(6 * 60 + 45);
  });
});

