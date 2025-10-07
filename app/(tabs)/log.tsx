// app/(tabs)/log.tsx
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// Toast handled by showError/showInfo/showSuccess helpers
import { showError, showInfo, showSuccess } from "@/src/lib/toast";
import {
  closeLatestOpenPrimary,
  createOpenPrimary,
  getOpenPrimary,
  SleepSegment,
} from "@/src/lib/db";
import { colors } from "@/src/theme/colors";
import dayjs from "dayjs";
import { useClockPref } from "@/src/lib/useClockPref";
import SolidButton from "@/src/components/solid-button";

export default function LogScreen() {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [openSegment, setOpenSegment] = useState<SleepSegment | null>(null);
  const [now, setNow] = useState(new Date());
  const { clock24h } = useClockPref();

  // Load open segment when screen focuses
  useFocusEffect(
    useCallback(() => {
      const loadOpenSegment = async () => {
        const seg = await getOpenPrimary();
        setOpenSegment(seg);
      };
      loadOpenSegment();
    }, [])
  );

  // Update "now" every minute for duration display
  useFocusEffect(
    useCallback(() => {
      if (!openSegment) return;
      const interval = setInterval(() => {
        setNow(new Date());
      }, 60000); // Update every minute
      return () => clearInterval(interval);
    }, [openSegment])
  );

  const onBedNow = useCallback(async () => {
    try {
      setBusy(true);
      await createOpenPrimary({ source: "user" });
      const seg = await getOpenPrimary();
      setOpenSegment(seg);
      showSuccess("Sleep started", `Logged at ${dayjs.utc(seg?.start_utc).local().format(clock24h ? "HH:mm" : "h:mm A")}`);
    } catch (e: any) {
      showError("Error", e);
    } finally {
      setBusy(false);
    }
  }, [clock24h]);

  const onWakeNow = useCallback(async () => {
    try {
      setBusy(true);
      const id = await closeLatestOpenPrimary();
      if (!id) {
        showInfo("Nothing to close", "No open sleep session found.");
      } else {
        showSuccess("Sleep ended", "Session closed successfully!");
      }
      setOpenSegment(null);
    } catch (e: any) {
      showError("Error", e);
    } finally {
      setBusy(false);
    }
  }, []);

  // Calculate duration for open segment
  const duration = openSegment
    ? dayjs().diff(dayjs.utc(openSegment.start_utc), "minute")
    : 0;
  const durationText = openSegment
    ? `${Math.floor(duration / 60)}h ${Math.abs(duration % 60)}m`
    : "";

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.centeredContent}>
        {openSegment ? (
          <>
            <View style={styles.iconContainer}>
              <Text style={styles.icon}>😴</Text>
            </View>

            <Text style={styles.statusTitle}>Sleeping</Text>

            <View style={styles.timeCard}>
              <Text style={styles.timeLabel}>Started at</Text>
              <Text style={styles.timeValue}>
                {dayjs.utc(openSegment.start_utc).local().format(clock24h ? "HH:mm" : "h:mm A")}
              </Text>
            </View>

            <View style={styles.durationCard}>
              <Text style={styles.durationLabel}>Duration</Text>
              <Text style={styles.durationValue}>{durationText}</Text>
            </View>

            <SolidButton
              title={busy ? "Working..." : "Just woke up"}
              onPress={onWakeNow}
              disabled={busy}
              style={{ width: "100%", maxWidth: 300, marginTop: 16 }}
              testID="wake-now"
            />
          </>
        ) : (
          <>
            <View style={styles.iconContainer}>
              <Text style={styles.icon}>🌙</Text>
            </View>

            <Text style={styles.statusTitle}>Ready to sleep</Text>

            <Text style={styles.subtitle}>
              Track your sleep by logging when you go to bed
            </Text>

            <SolidButton
              title={busy ? "Working..." : "Went to bed now"}
              onPress={onBedNow}
              disabled={busy}
              style={{ width: "100%", maxWidth: 300, marginTop: 16 }}
              testID="bed-now"
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  centeredContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 24,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.bgSecondary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  icon: {
    fontSize: 64,
  },
  statusTitle: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: 8,
  },
  timeCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 40,
    alignItems: "center",
    gap: 8,
    width: "100%",
    maxWidth: 300,
  },
  timeLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  timeValue: {
    fontSize: 48,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  durationCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: "center",
    gap: 4,
    width: "100%",
    maxWidth: 300,
  },
  durationLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  durationValue: {
    fontSize: 28,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  // Buttons use SolidButton for consistent app styling
});
