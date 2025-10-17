import SleepRibbons, { SleepRibbonsHandle } from '@/src/components/SleepRibbons';
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";

import {
  DEFAULT_EDITOR_PREFS,
  EditorPrefs,
  getSegmentsForLocalDate,
  loadEditorPrefs,
  SleepSegment
} from "@/src/lib/db";
import { makeDateRangeBackwards, todayLocalDate } from "@/src/lib/time";
import { useClockPref } from "@/src/lib/useClockPref";
import { colors } from "@/src/theme/colors";

type SegmentsMap = Record<string, SleepSegment[]>;

export default function TimelineScreen() {
  const insets = useSafeAreaInsets();
  // const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState<string[]>([]);
  const [segmentsByDate, setSegmentsByDate] = useState<SegmentsMap>({});
  const ribbonsRef = useRef<SleepRibbonsHandle>(null);
  const [editorPrefs, setEditorPrefs] = useState<EditorPrefs>(
    DEFAULT_EDITOR_PREFS
  );
  const { clock24h } = useClockPref();
  const [helpVisible, setHelpVisible] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);

  // Slide transition animation for slide changes
  const slideAnim = useSharedValue(1);
  const slideStyle = useAnimatedStyle(() => ({
    opacity: slideAnim.value,
    transform: [{ translateY: (1 - slideAnim.value) * 16 }],
  }));
  
  // Re-run animations when slide changes
  useEffect(() => {
    slideAnim.value = 0;
    slideAnim.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.cubic) });
  }, [slideIndex, slideAnim]);

  const slides = [
    {
      key: 'create',
      title: 'Create a segment',
      desc: 'Long‑press on an empty day to create a new sleep segment.',
      icon: 'touch-app' as const,
      example: <ExampleCreate />,
    },
    {
      key: 'adjust',
      title: 'Adjust times',
      desc: 'Drag the top/bottom handles to change end/start times.',
      icon: 'drag-handle' as const,
      example: <ExampleAdjust />,
    },
    {
      key: 'move',
      title: 'Move the segment',
      desc: 'Drag the body to move the entire segment up or down.',
      icon: 'pan-tool' as const,
      example: <ExampleMove />,
    },
    {
      key: 'delete',
      title: 'Delete quickly',
      desc: 'Double‑tap a segment to delete it.',
      icon: 'gesture' as const,
      example: <ExampleDelete />,
    },
  ];

  const current = slides[slideIndex];

  // Use useState with lazy initialization to avoid recalculating on every render
  const [today] = useState(() => todayLocalDate());
  const initialDates = useMemo(
    () => makeDateRangeBackwards(today, 30),
    [today]
  );

  // Reuse existing arrays when contents are unchanged to minimize DayColumn re-renders
  const arraysEqualByCoreFields = (a: SleepSegment[] | undefined, b: SleepSegment[] | undefined) => {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      const y = b[i];
      if (!y) return false;
      if (x.id !== y.id || x.start_utc !== y.start_utc || x.end_utc !== y.end_utc) {
        return false;
      }
    }
    return true;
  };

  const loadDates = useCallback(async (dateKeys: string[]) => {
    try {
      const fetched: SegmentsMap = {};
      for (const d of dateKeys) {
        fetched[d] = await getSegmentsForLocalDate(d);
      }
      setSegmentsByDate((prev) => {
        const next: SegmentsMap = { ...prev };
        for (const d of dateKeys) {
          const prevArr = prev[d];
          const newArr = fetched[d] ?? [];
          next[d] = arraysEqualByCoreFields(prevArr, newArr) ? prevArr : newArr;
        }
        return next;
      });
      setDates(dateKeys);
    } catch (e: any) {
      Toast.show({ type: "error", text1: "Error", text2: String(e?.message ?? e) });
    }
  }, []);

  const loadEditorPreferences = useCallback(async () => {
    try {
      const prefs = await loadEditorPrefs();
      setEditorPrefs(prefs);
    } catch (e: any) {
      Toast.show({
        type: "error",
        text1: "Error",
        text2: String(e?.message ?? e),
      });
    }
  }, []);

  useEffect(() => {
    loadDates(initialDates);
    loadEditorPreferences();
  }, [initialDates, loadDates, loadEditorPreferences]);


  const reloadVisible = useCallback(async () => {
    // reload the currently shown date range
    await loadDates(dates);
  }, [dates, loadDates]);

  useFocusEffect(
    useCallback(() => {
      // Refresh data and preferences when screen gains focus
      reloadVisible();
      loadEditorPreferences();
      const t = setTimeout(() => ribbonsRef.current?.scrollToEnd(false), 0);
      return () => {
        clearTimeout(t);
        // On blur, save edits (if any) and exit edit mode
        ribbonsRef.current?.saveAndExitEditMode?.();
      };
    }, [reloadVisible, loadEditorPreferences])
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.card}>
        {/* Help icon */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="How to use"
          hitSlop={4}
          style={styles.helpButton}
          onPress={() => setHelpVisible(true)}
        >
          <MaterialIcons
            name="help-outline"
            size={24}
            color={colors.accentMint}
          />
        </Pressable>
        <SleepRibbons
          ref={ribbonsRef}
          dates={dates}
          segmentsByDate={segmentsByDate}
          columnWidth={72}
          onPersist={reloadVisible}
          defaultDurationMin={editorPrefs.defaultSegmentLengthMin}
          snapMinutes={editorPrefs.snapMinutes}
          clock24h={clock24h}
        />
      </View>

      {/* Help modal (slideshow) */}
      <Modal visible={helpVisible} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View
            style={styles.modalCard}
          >
            {/* Header */}
            <Animated.View style={[styles.modalHeader, slideStyle]}>
              <View
                style={{ flexDirection: "row", alignItems: "center" }}
              >
                <MaterialIcons
                  name={current.icon}
                  size={20}
                  color={colors.textSecondary}
                />
                <Text style={styles.modalTitle}>{current.title}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
                onPress={() => {
                  setHelpVisible(false);
                  setSlideIndex(0);
                }}
              >
                <MaterialIcons
                  name="close"
                  size={22}
                  color={colors.textSecondary}
                />
              </Pressable>
            </Animated.View>

            {/* Example + Description grouped to keep them close */}
            <Animated.View style={[styles.modalExampleGroup, slideStyle]}>
              <View style={styles.modalExampleContainer}>{current.example}</View>
              <Text style={styles.modalDesc}>{current.desc}</Text>
            </Animated.View>

            {/* Pager controls */}
            <View style={styles.modalPager}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous"
                onPress={() => setSlideIndex((i) => Math.max(0, i - 1))}
                disabled={slideIndex === 0}
                style={[
                  styles.modalNavBtn,
                  slideIndex === 0 && styles.modalNavBtnDisabled,
                ]}
              >
                <MaterialIcons
                  name="chevron-left"
                  size={22}
                  color={
                    slideIndex === 0 ? colors.textTertiary : colors.textPrimary
                  }
                />
              </Pressable>

              <View style={styles.dots}>
                {slides.map((s, i) => (
                  <View
                    key={s.key}
                    style={[
                      styles.dot,
                      i === slideIndex ? styles.dotActive : undefined,
                    ]}
                  />
                ))}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  slideIndex === slides.length - 1 ? "Done" : "Next"
                }
                onPress={() => {
                  if (slideIndex === slides.length - 1) {
                    setHelpVisible(false);
                    setSlideIndex(0);
                  } else {
                    setSlideIndex((i) => Math.min(slides.length - 1, i + 1));
                  }
                }}
                style={styles.modalNavBtn}
              >
                <MaterialIcons
                  name="chevron-right"
                  size={22}
                  color={colors.textPrimary}
                />
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ----- Slideshow example components -----
const EX_SEGMENT_COLOR = 'rgba(110,231,183,0.44)';

function ExampleCreate() {
  const t = useSharedValue(0);
  // Segment appears after the long-press completes
  const segStyle = useAnimatedStyle(() => {
    const tt = t.value;
    const appearStart = 0.6;
    const p = tt < appearStart ? 0 : Math.min(1, (tt - appearStart) / (1 - appearStart));
    return {
      opacity: p,
      transform: [{ scale: 0.92 + 0.08 * p }],
    };
  });
  const ringStyle = useAnimatedStyle(() => {
    const tt = t.value;
    const active = tt < 0.6; // ring visible during press window
    const p = active ? tt / 0.6 : 1;
    return {
      opacity: active ? 0.8 - 0.5 * p : 0,
      transform: [{ scale: 1 + 0.25 * p }],
    };
  });
  useEffect(() => {
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.linear }), -1, false);
  }, [t]);

  const radius = 17;
  const left = 36 - radius; // center of the 72px column
  const top = 90 - radius;  // middle of 180px column

  return (
    <View style={styles.exampleBox}>
      <View style={[styles.exampleDayCol, { justifyContent: 'center' }]}>
        {/* long-press ring */}
        <Animated.View style={[styles.exampleTouchRing, { left, top, width: radius * 2, height: radius * 2, borderRadius: radius }, ringStyle]} />
        {/* press icon & hint */}
        <MaterialIcons name="touch-app" size={34} color={colors.accentMint} />
        {/* created segment appears after delay */}
        <Animated.View style={[styles.exampleSegment, { backgroundColor: EX_SEGMENT_COLOR }, segStyle]} />
      </View>
    </View>
  );
}

function ExampleAdjust() {
  const t = useSharedValue(0);
  // Base: ~8h height
  const segStyle = useAnimatedStyle(() => {
    const baseH = 60; // ~8 hours of the example column
    const delta = 16 * (t.value * 2 - 1); // -16..+16px
    const h = Math.max(40, baseH + delta);
    return { height: h };
  });
  const handleTopStyle = useAnimatedStyle(() => {
    // Anchor top handle at segment top (EX_SEG_TOP)
    const segTop = 40;
    return { top: segTop - 9 };
  });
  const handleBottomStyle = useAnimatedStyle(() => {
    // Move bottom handle with segment bottom
    const segTop = 40;
    const baseH = 60;
    const delta = 16 * (t.value * 2 - 1);
    const h = Math.max(40, baseH + delta);
    const bottomTop = segTop + h - 9;
    return { top: bottomTop };
  });
  useEffect(() => {
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [t]);
  return (
    <View style={styles.exampleBox}>
      <View style={styles.exampleDayCol}>
        <Animated.View style={[styles.exampleHandleTop, handleTopStyle]}><Text style={styles.exampleHandleGlyph}>≡</Text></Animated.View>
        <Animated.View style={[styles.exampleSegment, { backgroundColor: EX_SEGMENT_COLOR }, segStyle]} />
        <Animated.View style={[styles.exampleHandleBottom, handleBottomStyle]}><Text style={styles.exampleHandleGlyph}>≡</Text></Animated.View>
      </View>
    </View>
  );
}

function ExampleMove() {
  const t = useSharedValue(0);
  const translate = useAnimatedStyle(() => ({ transform: [{ translateY: -6 + 12 * t.value }] }));
  const handleTopStyle = useAnimatedStyle(() => ({
    // Align with segment top as it moves (segment top at 40)
    top: 40 - 9,
    transform: [{ translateY: -6 + 12 * t.value }],
  }));
  const handleBottomStyle = useAnimatedStyle(() => ({
    // Align with segment bottom (top + base height)
    top: 40 + 60 - 9,
    transform: [{ translateY: -6 + 12 * t.value }],
  }));
  const handStyle = useAnimatedStyle(() => ({
    top: 40 + 30 - 10, // center of segment vertically
    left: 24,
    transform: [{ translateY: -6 + 12 * t.value }],
  }));
  useEffect(() => {
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [t]);
  return (
    <View style={styles.exampleBox}>
      <View style={styles.exampleDayCol}>
        <Animated.View style={[styles.exampleHandleTop, handleTopStyle]}><Text style={styles.exampleHandleGlyph}>≡</Text></Animated.View>
        <Animated.View style={[styles.exampleSegment, { backgroundColor: EX_SEGMENT_COLOR }, translate]} />
        <Animated.View style={[styles.exampleHandleBottom, handleBottomStyle]}><Text style={styles.exampleHandleGlyph}>≡</Text></Animated.View>
        <Animated.View style={[{ position: 'absolute' }, handStyle]}>
          <MaterialIcons name="pan-tool" size={18} color={colors.accentMint} />
        </Animated.View>
      </View>
    </View>
  );
}

function ExampleDelete() {
  const t = useSharedValue(0);
  // Segment fade-out after double tap
  const segStyle = useAnimatedStyle(() => {
    const tt = t.value;
    let opacity = 1;
    if (tt >= 0.6 && tt < 0.9) {
      opacity = 1 - (tt - 0.6) / 0.3; // 1 -> 0 over 0.3 window
    } else if (tt >= 0.9) {
      opacity = 0;
    }
    return {
      opacity,
      transform: [{ scale: 0.98 + 0.02 * Math.sin(tt * Math.PI) }],
    };
  });

  // Ripple for two taps (same location), sequential windows [0.1,0.3] and [0.4,0.6]
  const ripple1Style = useAnimatedStyle(() => {
    const tt = t.value;
    const active = tt >= 0.1 && tt <= 0.3;
    const p = active ? (tt - 0.1) / 0.2 : 0;
    return {
      opacity: active ? 1 - p : 0,
      transform: [{ scale: 0.8 + 0.6 * p }],
    };
  });
  const ripple2Style = useAnimatedStyle(() => {
    const tt = t.value;
    const active = tt >= 0.4 && tt <= 0.6;
    const p = active ? (tt - 0.4) / 0.2 : 0;
    return {
      opacity: active ? 1 - p : 0,
      transform: [{ scale: 0.8 + 0.6 * p }],
    };
  });

  useEffect(() => {
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.linear }), -1, false);
  }, [t]);

  // Position for ripple: center of the segment rectangle
  const segTop = 40;
  const segH = 60;
  const rippleSize = 28;
  const rippleTop = segTop + segH / 2 - rippleSize / 2;
  const rippleLeft = 36 - rippleSize / 2; // day col center (72/2) minus radius

  return (
    <View style={styles.exampleBox}>
      <View style={styles.exampleDayCol}>
        {/* segment */}
        <Animated.View style={[styles.exampleSegment, { backgroundColor: EX_SEGMENT_COLOR }, segStyle]} />
        {/* double-tap ripples */}
        <Animated.View
          style={{ position: 'absolute', top: rippleTop, left: rippleLeft, width: rippleSize, height: rippleSize, borderRadius: rippleSize / 2, borderWidth: 2, borderColor: colors.accentMint }}
        />
        <Animated.View
          style={[{ position: 'absolute', top: rippleTop, left: rippleLeft, width: rippleSize, height: rippleSize, borderRadius: rippleSize / 2, borderWidth: 2, borderColor: colors.accentMint }, ripple1Style]}
        />
        <Animated.View
          style={[{ position: 'absolute', top: rippleTop, left: rippleLeft, width: rippleSize, height: rippleSize, borderRadius: rippleSize / 2, borderWidth: 2, borderColor: colors.accentMint }, ripple2Style]}
        />
      </View>
    </View>
  );
}

// (ExampleSave removed — slide no longer used)

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  helpButton: {
    position: "absolute",
    top: 0,
    right: 0,
    zIndex: 20,
    width: 24,
    height: 24,
  },
  card: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.borderPrimary,
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    paddingVertical: 6,
    marginHorizontal: 12,
    marginBottom: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  modalCard: {
    alignSelf: "center",
    width: "92%",
    maxWidth: 720,
    height: "65%",
    maxHeight: 720,
    backgroundColor: colors.bgSecondary,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderPrimary,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  modalTitle: {
    marginLeft: 6,
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 16,
  },
  modalExampleGroup: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modalExampleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDesc: {
    color: colors.textPrimary,
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  modalPager: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalNavBtn: {
    width: 40,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderPrimary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgPrimary,
  },
  modalNavBtnDisabled: {
    opacity: 0.5,
  },
  dots: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  dotActive: {
    backgroundColor: "#ffffff",
  },
  exampleBox: {
    width: "100%",
    height: 220,
    borderWidth: 1,
    borderColor: colors.borderPrimary,
    borderRadius: 12,
    backgroundColor: colors.bgPrimary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  exampleDayCol: {
    width: 72,
    height: 180,
    borderRadius: 8,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.borderPrimary,
    alignItems: "center",
    position: "relative",
  },
  exampleSegment: {
    position: "absolute",
    left: 10,
    right: 10,
    top: 40,
    height: 60,
    borderRadius: 6,
    backgroundColor: EX_SEGMENT_COLOR,
    alignItems: "center",
    justifyContent: "center",
  },
  exampleHandleTop: {
    position: "absolute",
    top: 22,
    left: 14,
    right: 14,
    height: 18,
    borderRadius: 4,
    backgroundColor: colors.accentMint,
    alignItems: "center",
    justifyContent: "center",
  },
  exampleHandleBottom: {
    position: "absolute",
    bottom: 22,
    left: 14,
    right: 14,
    height: 18,
    borderRadius: 4,
    backgroundColor: colors.accentMint,
    alignItems: "center",
    justifyContent: "center",
  },
  exampleHandleGlyph: {
    color: colors.bgPrimary,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 10,
  },
  exampleTouchRing: {
    position: "absolute",
    borderWidth: 2,
    borderColor: colors.accentMint,
  },
  exampleHint: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 12,
  },
  examplePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.accentMint,
  },
  examplePillText: {
    color: colors.bgPrimary,
    fontWeight: "800",
  },
});
