import * as Notifications from "expo-notifications";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Toast from "react-native-toast-message";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { MaterialIcons } from "@expo/vector-icons";
import { migrate, createOpenPrimary, closeLatestOpenPrimary } from "@/src/lib/db";
import {
  ensureAndroidChannel,
  ensurePermission,
  ensureLogActionCategories,
  scheduleDailyReminder,
  scheduleDailyActionReminder,
  cancelScheduled,
} from "@/src/lib/notifications";
import { PREF_KEYS } from "@/src/lib/db";
import { getPref, setPref } from "@/src/lib/prefs";
import { colors } from "@/src/theme/colors";
import { calculatePhaseShiftedTime, parseHm, todayLocalDate } from "@/src/lib/time";

// Sentry error monitoring (safe dynamic init; no-op if package not installed)
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Sentry = require("@sentry/react-native");
  Sentry.init({
    dsn: process.env.SENTRY_DSN || "",
    tracesSampleRate: 0.2,
    enableAutoPerformanceTracing: true,
  });
} catch {}

// Keep splash screen visible while loading fonts
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontsError] = useFonts({
    ...MaterialIcons.font,
  });

  useEffect(() => {
    if (fontsLoaded || fontsError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontsError]);

  useEffect(() => {
    if (!fontsLoaded && !fontsError) {
      return;
    }

    let isMounted = true;
    let notificationSubscription: Notifications.Subscription | null = null;

    const initializeApp = async () => {
      try {
        // Step 1: Migrate database first (creates tables)
        await migrate();
        
        // Step 2: Permissions + channel
        const notificationsEnabled = await ensurePermission();
        await ensureAndroidChannel();
        await ensureLogActionCategories();

        // Step 3: Calculate phase shift if active
        let phaseShiftData: { minutesPerDay: number; daysElapsed: number } | null = null;
        try {
          const shiftMinutesStr = await getPref(PREF_KEYS.phaseShiftMinutes);
          const shiftMinutes = shiftMinutesStr ? Number.parseInt(shiftMinutesStr, 10) : 0;

          if (shiftMinutes !== 0) {
            const startDate = await getPref(PREF_KEYS.phaseShiftStartDate);
            if (startDate) {
              const today = todayLocalDate();
              const start = new Date(startDate);
              const end = new Date(today);
              const diffTime = end.getTime() - start.getTime();
              const daysElapsed = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

              phaseShiftData = { minutesPerDay: shiftMinutes, daysElapsed };

              // Update last applied date
              await setPref(PREF_KEYS.phaseShiftLastApplied, today);
            }
          }
        } catch (e) {
          console.warn('Phase shift calculation failed:', e);
        }

        // Helper to apply phase shift
        const applyPhaseShift = (baseTime: { hour: number; minute: number }) => {
          if (!phaseShiftData) return baseTime;
          return calculatePhaseShiftedTime(baseTime, phaseShiftData.minutesPerDay, phaseShiftData.daysElapsed);
        };

        // Step 4: Recreate daily schedules based on stored prefs
        if (notificationsEnabled) {
          try {
            const melEnabled = await getPref('melatonin_enabled');
            const melTime = (await getPref('melatonin_time')) ?? '21:00';
            const melOldId = await getPref('melatonin_notif_id');
            const lightEnabled = await getPref('light_enabled');
            const lightTime = (await getPref('light_time')) ?? '07:00';
            const lightOldId = await getPref('light_notif_id');

            if (melOldId) await cancelScheduled(melOldId);
            if (lightOldId) await cancelScheduled(lightOldId);
            const bedEnabled = await getPref('log_bed_enabled');
            const bedTime = (await getPref('log_bed_time')) ?? '22:00';
            const bedOldId = await getPref('log_bed_notif_id');
            const wakeEnabled = await getPref('log_wake_enabled');
            const wakeTime = (await getPref('log_wake_time')) ?? '07:00';
            const wakeOldId = await getPref('log_wake_notif_id');
            if (bedOldId) await cancelScheduled(bedOldId);
            if (wakeOldId) await cancelScheduled(wakeOldId);

            if (melEnabled === '1') {
              const baseTime = parseHm(melTime);
              const scheduleTime = applyPhaseShift(baseTime);
              const id = await scheduleDailyReminder({
                hour: scheduleTime.hour,
                minute: scheduleTime.minute,
                title: 'Melatonin reminder',
                body: 'Time to take melatonin.',
              });
              await setPref('melatonin_notif_id', id);
            }

            if (lightEnabled === '1') {
              const baseTime = parseHm(lightTime);
              const scheduleTime = applyPhaseShift(baseTime);
              const id = await scheduleDailyReminder({
                hour: scheduleTime.hour,
                minute: scheduleTime.minute,
                title: 'Dark therapy',
                body: 'Dim lights before bed.',
              });
              await setPref('light_notif_id', id);
            }

            // Bedtime/wake logging prompts
            if (bedEnabled === '1') {
              const baseTime = parseHm(bedTime);
              const scheduleTime = applyPhaseShift(baseTime);
              const id = await scheduleDailyActionReminder({
                categoryId: 'bed-log',
                hour: scheduleTime.hour,
                minute: scheduleTime.minute,
                title: 'Bedtime',
                body: 'Log sleep now?',
              });
              await setPref('log_bed_notif_id', id);
            }
            if (wakeEnabled === '1') {
              const baseTime = parseHm(wakeTime);
              const scheduleTime = applyPhaseShift(baseTime);
              const id = await scheduleDailyActionReminder({
                categoryId: 'wake-log',
                hour: scheduleTime.hour,
                minute: scheduleTime.minute,
                title: 'Good morning',
                body: 'Log wake time?',
              });
              await setPref('log_wake_notif_id', id);
            }
          } catch (e) {
            console.warn('Reschedule on boot failed:', e);
          }
        }
        
        // Step 5: Set up notification listener (only if app is still mounted)
        if (isMounted) {
          notificationSubscription = Notifications.addNotificationResponseReceivedListener(
            async (resp) => {
              try {
                const action = resp.actionIdentifier;
                if (action === 'log_sleep_now') {
                  await createOpenPrimary({ source: 'notif' });
                  Toast.show({ type: 'success', text1: 'Sleep started', text2: 'Logged from notification' });
                } else if (action === 'log_wake_now') {
                  await closeLatestOpenPrimary();
                  Toast.show({ type: 'success', text1: 'Sleep ended', text2: 'Logged from notification' });
                }
                // Dismiss the tapped notification from the shade
                try {
                  const deliveredId = resp.notification.request.identifier;
                  await Notifications.dismissNotificationAsync(deliveredId);
                } catch {}
              } catch (e: any) {
                Toast.show({ type: 'error', text1: 'Action failed', text2: String(e?.message ?? e) });
              }
            }
          );
        }
      } catch (error) {
        console.warn('App initialization error:', error);
        // Gracefully handle errors - app should still function
        // even if some features like notifications fail
      }
    };

    initializeApp();

    return () => {
      isMounted = false;
      if (notificationSubscription) {
        notificationSubscription.remove();
      }
    };
  }, [fontsLoaded, fontsError]);

  if (!fontsLoaded && !fontsError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bgPrimary} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bgPrimary },
        }}
      />
      <Toast />
    </GestureHandlerRootView>
  );
}
