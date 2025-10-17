// app/(tabs)/log.tsx
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// Toast handled by showError/showInfo/showSuccess helpers
import SolidButton from "@/src/components/solid-button";
import {
  closeLatestOpenPrimary,
  createOpenPrimary,
  getOpenPrimary,
  SleepSegment,
} from "@/src/lib/db";
import { showError, showInfo, showSuccess } from "@/src/lib/toast";
import { useClockPref } from "@/src/lib/useClockPref";
import { colors } from "@/src/theme/colors";
import dayjs from "dayjs";

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
        {/* Icon - absolute fixed position */}
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>{openSegment ? "😴" : "🌙"}</Text>
        </View>

        {/* Title - absolute fixed position */}
        <View style={styles.titleContainer}>
          <Text style={styles.statusTitle}>
            {openSegment ? "Sleeping" : "Ready to sleep?"}
          </Text>
        </View>

        {/* Info cards - fixed space with absolute positioning */}
        <View style={styles.infoContainer}>
          {openSegment ? (
            <>
              <View style={styles.durationCard}>
                <Text style={styles.durationLabel}>Duration</Text>
                <Text style={styles.durationValue}>{durationText}</Text>
              </View>
            </>
          ) : null}
        </View>

        {/* Button - absolute fixed position */}
        <View style={styles.buttonContainer}>
          <SolidButton
            title={busy ? "Working..." : (openSegment ? "Just woke up" : "Went to bed now")}
            onPress={openSegment ? onWakeNow : onBedNow}
            disabled={busy}
            style={styles.buttonStyle}
            testID={openSegment ? "wake-now" : "bed-now"}
          />
        </View>
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
  },
  iconContainer: {
    position: "absolute",
    top: "25%",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.bgSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  icon: {
    fontSize: 56,
  },
  titleContainer: {
    position: "absolute",
    top: "25%",
    marginTop: 120, // Icon height (100) + gap (20)
    width: "100%",
    alignItems: "center",
  },
  statusTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
  },
  infoContainer: {
    position: "absolute",
    top: "25%",
    marginTop: 180, // Icon (100) + gap (20) + title (~40) + gap (20)
    width: "100%",
    maxWidth: 300,
    minHeight: 120, // Reserve space even when empty
    gap: 12,
    alignItems: "center",
  },
  timeCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 4,
    width: "100%",
  },
  timeLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  timeValue: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  durationCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 2,
    width: "100%",
  },
  durationLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  durationValue: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  buttonContainer: {
    position: "absolute",
    top: "25%",
    marginTop: 320, // Icon + gaps + title + infoContainer space
    width: "100%",
    maxWidth: 300,
    alignItems: "center",
  },
  buttonStyle: {
    width: "100%",
  },
  // Buttons use SolidButton for consistent app styling
});
