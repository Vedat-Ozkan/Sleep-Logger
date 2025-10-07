import { useCallback, useSyncExternalStore } from "react";
import Toast from "react-native-toast-message";
import { getPref, setPref } from "@/src/lib/prefs";

// Simple global store so changes propagate across tabs/screens instantly
let _clock24h = true;
let _loaded = false;
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore subscriber errors
    }
  });
}

function setClock(enabled: boolean) {
  if (_clock24h !== enabled) {
    _clock24h = enabled;
    notify();
  }
}

async function ensureLoaded() {
  if (_loaded) return;
  _loaded = true;
  try {
    const before = _clock24h;
    const v = await getPref("clock_24h");
    // Only apply the loaded value if nothing changed meanwhile
    if (_clock24h === before) {
      setClock(v == null ? true : v === "1");
    }
  } catch {
    // ignore load errors – default stays true
  }
}

export function useClockPref() {
  // Subscribe to global store
  const clock24h = useSyncExternalStore(
    (listener) => {
      // kick off async load on first subscribe
      ensureLoaded();
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    () => _clock24h,
    () => _clock24h
  );

  const updateClock24h = useCallback(async (enabled: boolean) => {
    const prev = _clock24h;
    setClock(enabled); // optimistic
    try {
      await setPref("clock_24h", enabled ? "1" : "0");
    } catch (e: any) {
      setClock(prev); // revert on failure
      Toast.show({ type: "error", text1: "Update failed", text2: String(e?.message ?? e) });
    }
  }, []);

  return { clock24h, updateClock24h } as const;
}
