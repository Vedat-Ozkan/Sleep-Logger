import { ScrollView, StyleSheet, Switch, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Card from "@/src/components/card";
import TimePickerButton from "@/src/components/time-picker-button";
import ToggleRow from "@/src/components/toggle-row";
import { scheduleDailyActionReminder, scheduleDailyReminder } from "@/src/lib/notifications";
import { useReminder } from "@/src/lib/reminders";
import { useClockPref } from "@/src/lib/useClockPref";
import { colors } from "@/src/theme/colors";

export default function RemindersScreen() {
  const insets = useSafeAreaInsets();
  const { clock24h } = useClockPref();
  const mel = useReminder({
    enabledKey: 'melatonin_enabled',
    timeKey: 'melatonin_time',
    notifIdKey: 'melatonin_notif_id',
    defaultTimeHm: '21:00',
    schedule: async (t) => scheduleDailyReminder({ idKey: 'melatonin', hour: t.hour, minute: t.minute, title: 'Melatonin reminder', body: 'Time to take melatonin.' }),
  });
  const bright = useReminder({
    enabledKey: 'light_enabled',
    timeKey: 'light_time',
    notifIdKey: 'light_notif_id',
    defaultTimeHm: '20:00',
    schedule: async (t) => scheduleDailyReminder({ idKey: 'brightlight', hour: t.hour, minute: t.minute, title: 'Dark therapy', body: 'Dim lights before bed.' }),
  });
  // Pickers are handled inside TimePickerButton

  const bed = useReminder({
    enabledKey: 'log_bed_enabled',
    timeKey: 'log_bed_time',
    notifIdKey: 'log_bed_notif_id',
    defaultTimeHm: '22:00',
    schedule: async (t) => scheduleDailyActionReminder({ categoryId: 'bed-log', hour: t.hour, minute: t.minute, title: 'Bedtime', body: 'Log sleep now?' }),
  });
  const wake = useReminder({
    enabledKey: 'log_wake_enabled',
    timeKey: 'log_wake_time',
    notifIdKey: 'log_wake_notif_id',
    defaultTimeHm: '07:00',
    schedule: async (t) => scheduleDailyActionReminder({ categoryId: 'wake-log', hour: t.hour, minute: t.minute, title: 'Good morning', body: 'Log wake time?' }),
  });

  // Notifications permission and channels are ensured in app/_layout.tsx
  // Time labels are computed inside TimePickerButton

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 16,
        paddingHorizontal: 20,
        gap: 16,
      }}
    >
      <Text style={styles.title}>Reminders</Text>

      <Card
        title="Melatonin"
        headerRight={
          <Switch
            value={mel.enabled}
            onValueChange={mel.toggle}
            trackColor={{
              false: colors.borderPrimary,
              true: colors.accentGreen,
            }}
            thumbColor={colors.white}
            ios_backgroundColor={colors.borderPrimary}
          />
        }
      >
        <Text style={styles.label}>Time</Text>
        <TimePickerButton
          time={mel.time}
          clock24h={clock24h}
          onConfirm={mel.setTimeAndReschedule}
        />
      </Card>

      <Card
        title="Dark therapy"
        headerRight={
          <Switch
            value={bright.enabled}
            onValueChange={bright.toggle}
            trackColor={{
              false: colors.borderPrimary,
              true: colors.accentGreen,
            }}
            thumbColor={colors.white}
            ios_backgroundColor={colors.borderPrimary}
          />
        }
      >
        <Text style={styles.label}>Time</Text>
        <TimePickerButton
          time={bright.time}
          clock24h={clock24h}
          onConfirm={bright.setTimeAndReschedule}
        />
      </Card>

      <Card title="Logging prompts">
        <ToggleRow
          label="Bedtime prompt"
          value={bed.enabled}
          onValueChange={bed.toggle}
        />
        <TimePickerButton
          time={bed.time}
          clock24h={clock24h}
          onConfirm={bed.setTimeAndReschedule}
        />
        <ToggleRow
          label="Wake prompt"
          value={wake.enabled}
          onValueChange={wake.toggle}
        />
        <TimePickerButton
          time={wake.time}
          clock24h={clock24h}
          onConfirm={wake.setTimeAndReschedule}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  title: { color: colors.textPrimary, fontWeight: "800", fontSize: 18 },
  label: { color: colors.textSecondary, fontSize: 14 },
});
