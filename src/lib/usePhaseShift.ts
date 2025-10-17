// src/lib/usePhaseShift.ts
import { useCallback, useEffect, useState } from "react";
import Toast from "react-native-toast-message";

import { PREF_KEYS } from "@/src/lib/db";
import { getPref, setPref } from "@/src/lib/prefs";

export interface PhaseShiftState {
  shiftMinutesPerDay: number; // -60 to +60
}

export function usePhaseShift() {
  const [state, setState] = useState<PhaseShiftState>({
    shiftMinutesPerDay: 0,
  });
  const [loading, setLoading] = useState(true);

  // Load phase shift settings
  useEffect(() => {
    (async () => {
      try {
        const shiftStr = await getPref(PREF_KEYS.phaseShiftMinutes);

        setState({
          shiftMinutesPerDay: shiftStr ? Number.parseInt(shiftStr, 10) : 0,
        });
      } catch (e: any) {
        Toast.show({
          type: "error",
          text1: "Failed to load phase shift settings",
          text2: String(e?.message ?? e),
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Set phase shift amount (persist only; no other behavior)
  const setShiftMinutes = useCallback(async (minutes: number) => {
    try {
      const clamped = Math.max(-60, Math.min(60, Math.round(minutes)));
      setState({ shiftMinutesPerDay: clamped });
      await setPref(PREF_KEYS.phaseShiftMinutes, String(clamped));
    } catch (e: any) {
      Toast.show({
        type: "error",
        text1: "Failed to update phase shift",
        text2: String(e?.message ?? e),
      });
    }
  }, []);

  return {
    shiftMinutesPerDay: state.shiftMinutesPerDay,
    setShiftMinutes,
    loading,
  } as const;
}
