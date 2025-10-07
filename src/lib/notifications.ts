import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export const ANDROID_CHANNEL_ID = "daily-reminders";

// Set a simple handler: show alert, no sound, no badge
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // Back-compat + new fields to silence SDK 54 warning
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "Daily Reminders",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 120, 200],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    // omit sound per requirements
  });
}

export async function ensurePermission(): Promise<boolean> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch (e) {
    console.warn("Permission request failed", e);
    return false;
  }
}

export async function scheduleDailyReminder(args: {
  idKey: "melatonin" | "brightlight";
  hour: number;
  minute: number;
  title: string;
  body: string;
}): Promise<string> {
  const { hour, minute, title, body } = args;

  const trigger: Notifications.NotificationTriggerInput = Platform.OS === "android"
    ? {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        channelId: ANDROID_CHANNEL_ID,
        hour,
        minute,
      }
    : {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        hour,
        minute,
        repeats: true,
      };

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
    },
    trigger,
  });
  return id;
}

export async function cancelScheduled(id: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch (e) {
    console.warn("Cancel scheduled failed", e);
  }
}

export async function cancelAll(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    console.warn("Cancel all scheduled failed", e);
  }
}

// Optional helpers for action buttons on notifications
export async function ensureLogActionCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync("bed-log", [
    {
      identifier: "log_sleep_now",
      buttonTitle: "Log sleep",
      options: { opensAppToForeground: false },
    },
  ]);
  await Notifications.setNotificationCategoryAsync("wake-log", [
    {
      identifier: "log_wake_now",
      buttonTitle: "Log wake",
      options: { opensAppToForeground: false },
    },
  ]);
}

export async function scheduleDailyActionReminder(args: {
  hour: number;
  minute: number;
  title: string;
  body: string;
  categoryId: "bed-log" | "wake-log";
}): Promise<string> {
  const { hour, minute, title, body, categoryId } = args;

  const trigger: Notifications.NotificationTriggerInput = Platform.OS === "android"
    ? {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        channelId: ANDROID_CHANNEL_ID,
        hour,
        minute,
      }
    : {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        hour,
        minute,
        repeats: true,
      };

  return Notifications.scheduleNotificationAsync({
    content: { title, body, categoryIdentifier: categoryId },
    trigger,
  });
}
