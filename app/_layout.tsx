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
import { getPref, setPref } from "@/src/lib/prefs";
import { colors } from "@/src/theme/colors";
import { parseHm } from "@/src/lib/reminders";

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

        // Step 2.5: Check and create automatic backup if due
        const { checkAndBackup } = await import('@/src/lib/autoBackup');
        await checkAndBackup();

        // Step 3: Recreate daily schedules based on stored prefs
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
              const { hour, minute } = parseHm(melTime);
              const id = await scheduleDailyReminder({
                idKey: 'melatonin',
                hour,
                minute,
                title: 'Melatonin reminder',
                body: 'Time to take melatonin.',
              });
              await setPref('melatonin_notif_id', id);
            }

            if (lightEnabled === '1') {
              const { hour, minute } = parseHm(lightTime);
              const id = await scheduleDailyReminder({
                idKey: 'brightlight',
                hour,
                minute,
                title: 'Dark therapy',
                body: 'Dim lights before bed.',
              });
              await setPref('light_notif_id', id);
            }

            // Bedtime/wake logging prompts
            if (bedEnabled === '1') {
              const { hour, minute } = parseHm(bedTime);
              const id = await scheduleDailyActionReminder({
                categoryId: 'bed-log',
                hour,
                minute,
                title: 'Bedtime',
                body: 'Log sleep now?',
              });
              await setPref('log_bed_notif_id', id);
            }
            if (wakeEnabled === '1') {
              const { hour, minute } = parseHm(wakeTime);
              const id = await scheduleDailyActionReminder({
                categoryId: 'wake-log',
                hour,
                minute,
                title: 'Good morning',
                body: 'Log wake time?',
              });
              await setPref('log_wake_notif_id', id);
            }
          } catch (e) {
            console.warn('Reschedule on boot failed:', e);
          }
        }
        
        // Step 4: Set up notification listener (only if app is still mounted)
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
