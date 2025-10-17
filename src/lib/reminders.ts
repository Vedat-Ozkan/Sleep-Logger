import { useCallback, useEffect, useState } from "react";
import Toast from "react-native-toast-message";

import { getPref, setPref } from "@/src/lib/prefs";
import { calculatePhaseShiftedTime, hmToString, parseHm, TimeOfDay as Hm } from "@/src/lib/time";
import { cancelScheduled } from "@/src/lib/notifications";

export type { Hm };

type UseReminderOptions = {
  enabledKey: string;
  timeKey: string;
  notifIdKey: string;
  defaultTimeHm: string; // "HH:mm"
  schedule: (t: Hm) => Promise<string>; // returns scheduled notification id
  phaseShift?: {
    minutesPerDay: number;
    daysElapsed: number;
  };
};

export function useReminder(options: UseReminderOptions) {
  const { enabledKey, timeKey, notifIdKey, defaultTimeHm, schedule, phaseShift } = options;

  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState<Hm>(parseHm(defaultTimeHm, { hour: 9, minute: 0 }));
  const [busy, setBusy] = useState(false);

  // Apply phase shift if active
  const getScheduleTime = useCallback((baseTime: Hm): Hm => {
    if (!phaseShift || phaseShift.minutesPerDay === 0) {
      return baseTime;
    }
    return calculatePhaseShiftedTime(baseTime, phaseShift.minutesPerDay, phaseShift.daysElapsed);
  }, [phaseShift]);

  useEffect(() => {
    (async () => {
      try {
        setEnabled((await getPref(enabledKey)) === "1");
        const hm = (await getPref(timeKey)) ?? defaultTimeHm;
        setTime(parseHm(hm, { hour: 9, minute: 0 }));
      } catch (e: any) {
        Toast.show({ type: "error", text1: "Load failed", text2: String(e?.message ?? e) });
      }
    })();
  }, [enabledKey, timeKey, defaultTimeHm]);

  const toggle = useCallback(
    async (next: boolean) => {
      if (busy) return;
      setBusy(true);
      setEnabled(next); // Optimistic
      try {
        const oldId = (await getPref(notifIdKey)) || "";
        if (oldId) await cancelScheduled(oldId);
        await setPref(enabledKey, next ? "1" : "0");
        if (next) {
          // Apply phase shift to base time before scheduling
          const scheduleTime = getScheduleTime(time);
          const id = await schedule(scheduleTime);
          await setPref(notifIdKey, id);
          await setPref(timeKey, hmToString(time)); // Store base time, not shifted
        } else {
          await setPref(notifIdKey, "");
        }
      } catch (e: any) {
        setEnabled(!next); // Revert
        Toast.show({ type: "error", text1: "Update failed", text2: String(e?.message ?? e) });
      } finally {
        setBusy(false);
      }
    },
    [busy, enabledKey, notifIdKey, schedule, time, timeKey, getScheduleTime]
  );

  const setTimeAndReschedule = useCallback(
    async (d: Date) => {
      if (busy) return;
      setBusy(true);
      try {
        const t = { hour: d.getHours(), minute: d.getMinutes() };
        setTime(t);
        await setPref(timeKey, hmToString(t)); // Store base time
        if (enabled) {
          const oldId = (await getPref(notifIdKey)) || "";
          if (oldId) await cancelScheduled(oldId);
          // Apply phase shift before scheduling
          const scheduleTime = getScheduleTime(t);
          const id = await schedule(scheduleTime);
          await setPref(notifIdKey, id);
        }
      } catch (e: any) {
        Toast.show({ type: "error", text1: "Update failed", text2: String(e?.message ?? e) });
      } finally {
        setBusy(false);
      }
    },
    [busy, enabled, notifIdKey, schedule, timeKey, getScheduleTime]
  );

  // Calculate the actual scheduled time for display
  const scheduledTime = getScheduleTime(time);

  return {
    enabled,
    time, // Base time (for editing)
    scheduledTime, // Actual time with phase shift applied (for display)
    toggle,
    setTimeAndReschedule,
    busy,
  } as const;
}
