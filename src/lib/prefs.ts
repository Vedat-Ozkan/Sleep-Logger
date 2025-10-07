// src/lib/prefs.ts
// Backwards-compat thin wrapper around db.ts app prefs helpers
import { getAppPref, setAppPref } from "@/src/lib/db";

export async function setPref(key: string, value: string): Promise<void> {
  await setAppPref(key, value);
}

export async function getPref(key: string): Promise<string | null> {
  return getAppPref(key);
}
