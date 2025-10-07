import { useCallback, useEffect, useState } from "react";
import Toast from "react-native-toast-message";

import { getPref, setPref } from "@/src/lib/prefs";
import { cancelScheduled } from "@/src/lib/notifications";

export type Hm = { hour: number; minute: number };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function parseHm(hm: string): Hm {
  const [h, m] = hm.split(":");
  const hour = clamp(parseInt(h || "0", 10) || 0, 0, 23);
  const minute = clamp(parseInt(m || "0", 10) || 0, 0, 59);
  return { hour, minute };
}

export function hmToString(t: Hm): string {
  return `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
}

type UseReminderOptions = {
  enabledKey: string;
  timeKey: string;
  notifIdKey: string;
  defaultTimeHm: string; // "HH:mm"
  schedule: (t: Hm) => Promise<string>; // returns scheduled notification id
};

export function useReminder(options: UseReminderOptions) {
  const { enabledKey, timeKey, notifIdKey, defaultTimeHm, schedule } = options;

  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState<Hm>(parseHm(defaultTimeHm));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setEnabled((await getPref(enabledKey)) === "1");
        const hm = (await getPref(timeKey)) ?? defaultTimeHm;
        setTime(parseHm(hm));
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
          const id = await schedule(time);
          await setPref(notifIdKey, id);
          await setPref(timeKey, hmToString(time));
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
    [busy, enabledKey, notifIdKey, schedule, time, timeKey]
  );

  const setTimeAndReschedule = useCallback(
    async (d: Date) => {
      if (busy) return;
      setBusy(true);
      try {
        const t = { hour: d.getHours(), minute: d.getMinutes() };
        setTime(t);
        await setPref(timeKey, hmToString(t));
        if (enabled) {
          const oldId = (await getPref(notifIdKey)) || "";
          if (oldId) await cancelScheduled(oldId);
          const id = await schedule(t);
          await setPref(notifIdKey, id);
        }
      } catch (e: any) {
        Toast.show({ type: "error", text1: "Update failed", text2: String(e?.message ?? e) });
      } finally {
        setBusy(false);
      }
    },
    [busy, enabled, notifIdKey, schedule, timeKey]
  );

  return {
    enabled,
    time,
    toggle,
    setTimeAndReschedule,
    busy,
  } as const;
}
