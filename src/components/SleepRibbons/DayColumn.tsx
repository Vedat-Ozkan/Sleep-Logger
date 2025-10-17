// src/components/SleepRibbons/DayColumn.tsx
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import Svg, { Line } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import type { SleepSegment } from "../../lib/db";
import { clampSegmentToLocalDay, shortMonthDay, minutesToHmPref } from "../../lib/time";
import {
  COLORS,
  HANDLE_SIZE,
  HANDLE_TOUCH_SIZE,
  LABEL_H,
  LONG_PRESS_DURATION,
  MIN_CREATE_MINUTES,
  MIN_DURATION,
  MINUTES_PER_DAY
} from "./constants";
import { wClamp, wMinutesToHm12, wMinutesToHm24, wSnapTo } from "./workletHelpers";

// Time label component - shows HH:MM time near handles during editing
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

function TimeLabel({
  minutes,
  position,
  clock24h,
  // For gating updates to only the column where the handle is present
  dayStartMs,
  activeDayStartMsSV,
  startDayOffsetSV,
  endDayOffsetSV,
  bodyDragModeSV,
}: {
  minutes: SharedValue<number>;
  position: "top" | "bottom";
  clock24h: boolean;
  dayStartMs: number;
  activeDayStartMsSV: SharedValue<number>;
  startDayOffsetSV: SharedValue<number>;
  endDayOffsetSV: SharedValue<number>;
  bodyDragModeSV: SharedValue<"none" | "horizontal" | "vertical">;
}) {
  // Pure UI-thread text: avoid JS state updates entirely by driving a TextInput via animatedProps
  const animatedText = useAnimatedProps(() => {
    "worklet";
    // Determine if this handle is on this day to avoid scheduling RN updates across many columns
    const editDayMs = activeDayStartMsSV.value;
    const offset = position === "top" ? endDayOffsetSV.value : startDayOffsetSV.value;
    const handleDayMs = editDayMs + (offset * 86400000);
    const isHere = handleDayMs === dayStartMs;

    if (!isHere) {
      // Return empty text when not needed
      return { text: "" } as any;
    }

    const mins = Math.round(minutes.value);
    const timeStr = clock24h ? wMinutesToHm24(mins) : wMinutesToHm12(mins);
    return { text: timeStr } as any;
  }, [clock24h, dayStartMs]);

  // Provide an initial default so the label is visible immediately on mount
  const defaultStr = useMemo(() => {
    try {
      const mins = Math.round((minutes as any)?.value ?? 0);
      return minutesToHmPref(mins, clock24h);
    } catch {
      return "";
    }
  }, [minutes, clock24h]);

  const containerStyle = useAnimatedStyle(() => {
    "worklet";
    const editDayMs = activeDayStartMsSV.value;
    const offset = position === "top" ? endDayOffsetSV.value : startDayOffsetSV.value;
    const handleDayMs = editDayMs + (offset * 86400000);
    const isHere = handleDayMs === dayStartMs;
    return {
      opacity: isHere ? 1 : 0,
      transform: [{ scale: 1 }],
    };
  }, [dayStartMs]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          // Position above for top handle, below for bottom handle, with extra spacing
          ...(position === "top"
            ? { bottom: HANDLE_TOUCH_SIZE  }
            : { top: HANDLE_TOUCH_SIZE  }),
          left: 0,
          right: 0,
          alignItems: "center",
        },
        containerStyle,
      ]}
    >
      <AnimatedTextInput
        editable={false}
        underlineColorAndroid="transparent"
        pointerEvents="none"
        defaultValue={defaultStr}
        style={{
          color: "#ffffff",
          fontSize: 10,
          fontWeight: "700",
          fontVariant: ["tabular-nums"],
          padding: 0,
          margin: 0,
          textAlign: "center",
        }}
        animatedProps={animatedText}
      />
    </Animated.View>
  );
}

type EditingSession = {
  id: string;
  hasSaved: boolean;
  dayKey: string;
  isDirty: boolean;
};

type Props = {
  dateKey: string;
  dayStartMs: number;
  width: number;
  height: number;
  segs: SleepSegment[];
  isToday: boolean;
  edit: EditingSession | null;
  // Shared values
  startMinSV: SharedValue<number>;
  endMinSV: SharedValue<number>;
  isEditingSV: SharedValue<number>;
  activeDayStartMsSV: SharedValue<number>;
  startDayOffsetSV: SharedValue<number>;
  endDayOffsetSV: SharedValue<number>;
  bodyDragModeSV: SharedValue<"none" | "horizontal" | "vertical">;
  // Callbacks
  startNewEdit: (dayKey: string, startMin: number, endMin: number, dayStartMs: number) => void;
  startNewEditWithOffset: (dayKey: string, startMin: number, endMin: number, dayStartMs: number, startDayOffset: number, endDayOffset: number) => void;
  startExistingEdit: (seg: SleepSegment, dayKey: string, dayStartMs: number) => void;
  markDirty: () => void;
  deleteEdit: () => void;
  defaultDurationMin: number;
  snapMinutes: number;
  clock24h: boolean;
};

function DayColumnComponent({
  dateKey,
  dayStartMs,
  width,
  height,
  segs,
  isToday,
  edit,
  startMinSV,
  endMinSV,
  isEditingSV,
  activeDayStartMsSV,
  startDayOffsetSV,
  endDayOffsetSV,
  bodyDragModeSV,
  startNewEdit,
  startNewEditWithOffset,
  startExistingEdit,
  markDirty,
  deleteEdit,
  defaultDurationMin,
  snapMinutes,
  clock24h,
}: Props) {
  const safeSnap = useMemo(() => (snapMinutes > 0 ? snapMinutes : 5), [snapMinutes]);
  // Track current time (minutes from midnight) for today
  const [nowMin, setNowMin] = useState<number | null>(isToday ? (new Date().getHours() * 60 + new Date().getMinutes()) : null);
  useEffect(() => {
    if (!isToday) {
      setNowMin(null);
      return;
    }
    const update = () => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [isToday]);
  // static segments
  const rects = useMemo(() => {
    return segs
      .map((s) => {
        const clamped = clampSegmentToLocalDay(
          dateKey,
          s.start_utc,
          s.end_utc
        );
        if (!clamped) return null;
        let { startMin, endMin } = clamped;
        // For open segments on today, cap the visual end at current time
        if (!s.end_utc && isToday && nowMin != null) {
          const capped = Math.max(startMin + 1, Math.min(nowMin, MINUTES_PER_DAY - 1));
          endMin = Math.min(endMin, capped);
        }
        const yTop = (1 - endMin / MINUTES_PER_DAY) * height;
        const yBot = (1 - startMin / MINUTES_PER_DAY) * height;
        return {
          seg: s,
          y: Math.min(yTop, yBot),
          h: Math.max(2, Math.abs(yBot - yTop)),
        };
      })
      .filter(Boolean) as { seg: SleepSegment; y: number; h: number }[];
  }, [segs, dateKey, height, isToday, nowMin]);

  // create via long-press empty
  const longPressEmpty = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(LONG_PRESS_DURATION)
        .runOnJS(true)
        .onStart((e) => {
          // If already editing, just ignore - user must use Done button to exit
          if (edit) {
            return;
          }

          const y = Math.max(
            0,
            Math.min(height, (e as any).y ?? (e as any).absoluteY ?? 0)
          );
          let startMin = Math.round((1 - y / height) * MINUTES_PER_DAY);
          startMin = Math.min(startMin, MINUTES_PER_DAY - MIN_DURATION);
          startMin = Math.max(0, wSnapTo(startMin, safeSnap));

          const desiredDuration = Math.max(
            MIN_CREATE_MINUTES,
            Math.min(defaultDurationMin, MINUTES_PER_DAY)
          );

          // Smart overnight sleep creation: if default duration would go past midnight,
          // create cross-day segment
          const wouldCrossMidnight = startMin + desiredDuration >= MINUTES_PER_DAY;

          if (wouldCrossMidnight) {
            let endMin = (startMin + desiredDuration) - MINUTES_PER_DAY;
            endMin = Math.max(0, wSnapTo(endMin, safeSnap));
            startNewEditWithOffset(dateKey, startMin, endMin, dayStartMs, 0, 1);
          } else {
            let endMin = Math.min(MINUTES_PER_DAY - 1, startMin + desiredDuration);
            if (endMin - startMin < MIN_CREATE_MINUTES) {
              startMin = Math.max(0, endMin - MIN_CREATE_MINUTES);
            }
            endMin = Math.max(startMin + MIN_CREATE_MINUTES, wSnapTo(endMin, safeSnap));
            endMin = Math.min(MINUTES_PER_DAY - 1, endMin);
            if (endMin - startMin < MIN_CREATE_MINUTES) {
              endMin = Math.min(MINUTES_PER_DAY - 1, startMin + MIN_CREATE_MINUTES);
            }
            startNewEdit(dateKey, startMin, endMin, dayStartMs);
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [height, dateKey, dayStartMs, edit, defaultDurationMin, safeSnap]
  );

  // enter edit for existing segment - memoized by segment id
  const longPressSegGesture = useCallback(
    (seg: SleepSegment) =>
      Gesture.LongPress()
        .minDuration(LONG_PRESS_DURATION)
        .runOnJS(true)
        .onStart(() => {
          startExistingEdit(seg, dateKey, dayStartMs);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dateKey, dayStartMs]
  );


  // Handle styles - always use normal color
  const topHandleStyle = useAnimatedStyle(() => {
    "worklet";
    return {
      backgroundColor: COLORS.handleNormal,
    };
  }, []);

  const bottomHandleStyle = useAnimatedStyle(() => {
    "worklet";
    return {
      backgroundColor: COLORS.handleNormal,
    };
  }, []);

  // Multi-day segment rendering - show continuous segment across all spanned days
  const spanningSegmentStyle = useAnimatedStyle(() => {
    "worklet";
    const editDayMs = activeDayStartMsSV.value;
    const startDayMs = editDayMs + (startDayOffsetSV.value * 86400000);
    const endDayMs = editDayMs + (endDayOffsetSV.value * 86400000);

    // Determine if this day is within the segment span
    const isStartDay = dayStartMs === startDayMs;
    const isEndDay = dayStartMs === endDayMs;
    const isMiddleDay = dayStartMs > startDayMs && dayStartMs < endDayMs;

    if (!isStartDay && !isEndDay && !isMiddleDay) {
      return { opacity: 0, height: 0 };
    }

    let top = 0;
    let bottom = 0;

    if (isStartDay && isEndDay) {
      // Segment starts and ends on same day - use actual times
      // Clamp values to prevent visual overflow when dragging beyond day boundaries
      const clampedEndMin = wClamp(endMinSV.value, 0, MINUTES_PER_DAY);
      const clampedStartMin = wClamp(startMinSV.value, 0, MINUTES_PER_DAY);
      const yTop = (1 - clampedEndMin / MINUTES_PER_DAY) * height;
      const yBot = (1 - clampedStartMin / MINUTES_PER_DAY) * height;
      top = Math.min(yTop, yBot);
      bottom = height - Math.max(yTop, yBot);
    } else if (isStartDay) {
      // Start day - from start time to midnight (bottom)
      const yBot = (1 - startMinSV.value / MINUTES_PER_DAY) * height;
      top = 0;
      bottom = height - yBot;
    } else if (isEndDay) {
      // End day - from midnight (top) to end time
      const yTop = (1 - endMinSV.value / MINUTES_PER_DAY) * height;
      top = yTop;
      bottom = 0;
    } else {
      // Middle day - full height
      top = 0;
      bottom = 0;
    }

    const h = height - top - bottom;

    return {
      opacity: 1,
      position: "absolute" as const,
      left: 6,
      right: 6,
      top,
      height: Math.max(8, h),
      borderRadius: 8,
      backgroundColor: COLORS.segmentFocused,
      borderWidth: 1,
      borderColor: COLORS.segmentBorder,
    };
  }, [height, dayStartMs]);

  // Handle visibility based on day offset
  const topHandleVisibilityStyle = useAnimatedStyle(() => {
    "worklet";
    const editDayMs = activeDayStartMsSV.value;
    const handleDayMs = editDayMs + (endDayOffsetSV.value * 86400000);
    const isHandleOnThisDay = dayStartMs === handleDayMs;
    return {
      opacity: isHandleOnThisDay ? 1 : 0,
      pointerEvents: isHandleOnThisDay ? ("auto" as const) : ("none" as const),
    };
  }, [dayStartMs]);

  // (Delete selection overlay removed)

  // (Delete gestures removed)
  const bottomHandleVisibilityStyle = useAnimatedStyle(() => {
    "worklet";
    const editDayMs = activeDayStartMsSV.value;
    const handleDayMs = editDayMs + (startDayOffsetSV.value * 86400000);
    const isHandleOnThisDay = dayStartMs === handleDayMs;
    return {
      opacity: isHandleOnThisDay ? 1 : 0,
      pointerEvents: isHandleOnThisDay ? ("auto" as const) : ("none" as const),
    };
  }, [dayStartMs]);

  // Body visibility - should be draggable on any day the segment spans
  // During horizontal drag, keep gesture active on the initiating column
  const bodyVisibilityStyle = useAnimatedStyle(() => {
    "worklet";
    const editDayMs = activeDayStartMsSV.value;
    const startDayMs = editDayMs + (startDayOffsetSV.value * 86400000);
    const endDayMs = editDayMs + (endDayOffsetSV.value * 86400000);

    // Check if this day is within the segment span OR is the active day during horizontal drag
    const isWithinSpan = dayStartMs >= startDayMs && dayStartMs <= endDayMs;
    const isActiveDayDuringHorizontalDrag = bodyDragModeSV.value === "horizontal" && dayStartMs === editDayMs;

    return {
      pointerEvents: (isWithinSpan || isActiveDayDuringHorizontalDrag) ? ("auto" as const) : ("none" as const),
    };
  }, [dayStartMs]);

  // (Delete button removed; deletion via double-tap only)

  // Track initial offset and minutes when gesture starts
  const topHandleInitialOffset = useSharedValue(0);
  const topHandleInitialMin = useSharedValue(0);

  // gestures with proper cancellation handling
  const gTop = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(50)
        .onStart(() => {
          "worklet";
          // Store the current offset and minutes when gesture starts
          topHandleInitialOffset.value = endDayOffsetSV.value;
          topHandleInitialMin.value = endMinSV.value;
        })
        .onChange((e) => {
          "worklet";
          // Only respond to gestures when editing
          if (isEditingSV.value !== 1) return;

          // Y-axis: adjust time within day using TOTAL translation from gesture start
          const deltaMin = Math.round((-e.translationY / height) * MINUTES_PER_DAY);
          let endMin = topHandleInitialMin.value + deltaMin;

          // X-axis: calculate day offset based on horizontal drag from gesture start
          // Add translationX to the initial offset
          let dayOffset = topHandleInitialOffset.value + Math.round(e.translationX / width);

          // Handle vertical drag crossing day boundaries
          while (endMin < 0) {
            dayOffset--;
            endMin += MINUTES_PER_DAY;
          }
          while (endMin >= MINUTES_PER_DAY) {
            dayOffset++;
            endMin -= MINUTES_PER_DAY;
          }

          // Prevent end handle from going to a day before start handle
          if (dayOffset < startDayOffsetSV.value) {
            dayOffset = startDayOffsetSV.value;
            endMin = 0;
          }

          endDayOffsetSV.value = dayOffset;

          // Enforce minimum duration relative to start handle
          const totalStartMin = startMinSV.value + (startDayOffsetSV.value * MINUTES_PER_DAY);
          const totalEndMin = endMin + (dayOffset * MINUTES_PER_DAY);
          if (totalEndMin - totalStartMin < MIN_DURATION) {
            // Adjust endMin to maintain minimum duration
            const requiredEndMin = totalStartMin - (dayOffset * MINUTES_PER_DAY) + MIN_DURATION;
            endMin = requiredEndMin;
            // Re-normalize if this pushes us over day boundaries
            while (endMin >= MINUTES_PER_DAY) {
              dayOffset++;
              endMin -= MINUTES_PER_DAY;
              endDayOffsetSV.value = dayOffset;
            }
          }

          endMinSV.value = endMin;
          scheduleOnRN(markDirty);
        })
        .onEnd(() => {
          "worklet";
          const editDayMs = activeDayStartMsSV.value;
          let dayOffset = endDayOffsetSV.value;
          const handleDayMs = editDayMs + (dayOffset * 86400000);
          const isHandleHere = dayStartMs === handleDayMs && isEditingSV.value === 1;

          if (!isHandleHere) return;

          // Snap to configured snap interval
          let endMin = wSnapTo(endMinSV.value, safeSnap);

          // Re-normalize if snap pushed us over day boundary
          while (endMin >= MINUTES_PER_DAY) {
            dayOffset++;
            endMin -= MINUTES_PER_DAY;
          }
          while (endMin < 0) {
            dayOffset--;
            endMin += MINUTES_PER_DAY;
          }

          endDayOffsetSV.value = dayOffset;
          endMinSV.value = endMin;

          scheduleOnRN(markDirty);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [height, dayStartMs, safeSnap, width]
  );

  // Track initial offset and minutes when gesture starts
  const bottomHandleInitialOffset = useSharedValue(0);
  const bottomHandleInitialMin = useSharedValue(0);

  const gBottom = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(50)
        .onStart(() => {
          "worklet";
          // Store the current offset and minutes when gesture starts
          bottomHandleInitialOffset.value = startDayOffsetSV.value;
          bottomHandleInitialMin.value = startMinSV.value;
        })
        .onChange((e) => {
          "worklet";
          // Only respond to gestures when editing
          if (isEditingSV.value !== 1) return;

          // Y-axis: adjust time within day using TOTAL translation from gesture start
          const deltaMin = Math.round((-e.translationY / height) * MINUTES_PER_DAY);
          let startMin = bottomHandleInitialMin.value + deltaMin;

          // X-axis: calculate day offset based on horizontal drag from gesture start
          // Add translationX to the initial offset
          let dayOffset = bottomHandleInitialOffset.value + Math.round(e.translationX / width);

          // Handle vertical drag crossing day boundaries
          while (startMin < 0) {
            dayOffset--;
            startMin += MINUTES_PER_DAY;
          }
          while (startMin >= MINUTES_PER_DAY) {
            dayOffset++;
            startMin -= MINUTES_PER_DAY;
          }

          // Prevent start handle from going to a day after end handle
          if (dayOffset > endDayOffsetSV.value) {
            dayOffset = endDayOffsetSV.value;
            startMin = MINUTES_PER_DAY - 1;
          }

          startDayOffsetSV.value = dayOffset;

          // Keep time within 0-1440 for the current offset day
          startMin = wClamp(startMin, 0, MINUTES_PER_DAY);

          // Enforce minimum duration relative to end handle
          const totalStartMin = startMin + (dayOffset * MINUTES_PER_DAY);
          const totalEndMin = endMinSV.value + (endDayOffsetSV.value * MINUTES_PER_DAY);
          if (totalEndMin - totalStartMin < MIN_DURATION) {
            startMin = wClamp(totalEndMin - (dayOffset * MINUTES_PER_DAY) - MIN_DURATION, 0, MINUTES_PER_DAY);
          }

          startMinSV.value = startMin;
          scheduleOnRN(markDirty);
        })
        .onEnd(() => {
          "worklet";
          const editDayMs = activeDayStartMsSV.value;
          const handleDayMs = editDayMs + (startDayOffsetSV.value * 86400000);
          const isHandleHere = dayStartMs === handleDayMs && isEditingSV.value === 1;

          if (!isHandleHere) return;

          // Snap to configured snap interval
          let startMin = wSnapTo(startMinSV.value, safeSnap);
          startMin = wClamp(startMin, 0, MINUTES_PER_DAY);
          startMinSV.value = startMin;

          scheduleOnRN(markDirty);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [height, dayStartMs, safeSnap, width]
  );

  // Track initial minutes and offsets for body drag
  const bodyInitialStartMin = useSharedValue(0);
  const bodyInitialEndMin = useSharedValue(0);
  const bodyInitialStartOffset = useSharedValue(0);
  const bodyInitialEndOffset = useSharedValue(0);

  // Double-tap to delete
  const doubleTapDelete = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .maxDuration(300) // Must be quick taps
        .runOnJS(true)
        .onStart(() => {
          if (edit) {
            deleteEdit();
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edit]
  );

  const gBody = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(1)
        .maxPointers(1)
        // Keep tracking even if the finger leaves the column so users can
        // shift across many days in a single gesture
        .shouldCancelWhenOutside(false)
        .onStart(() => {
          "worklet";
          // Store initial values when gesture starts
          bodyInitialStartMin.value = startMinSV.value;
          bodyInitialEndMin.value = endMinSV.value;
          bodyInitialStartOffset.value = startDayOffsetSV.value;
          bodyInitialEndOffset.value = endDayOffsetSV.value;
          bodyDragModeSV.value = "none";
        })
        .onChange((evt) => {
          "worklet";
          // Combined 2D drag: allow simultaneous horizontal (day shift)
          // and vertical (time shift) movement in a single gesture.
          if (isEditingSV.value !== 1) return;

          const dragProgressX = evt.translationX / width;
          const dayShift = Math.floor(dragProgressX + 0.5); // shift at 0.5 width steps, supports multi-day
          const deltaMin = Math.round((-evt.translationY / height) * MINUTES_PER_DAY);

          // Base from initial state
          let startMin = bodyInitialStartMin.value + deltaMin;
          let endMin = bodyInitialEndMin.value + deltaMin;
          let startOffset = bodyInitialStartOffset.value + dayShift;
          let endOffset = bodyInitialEndOffset.value + dayShift;

          // Normalize minutes across day boundaries, updating offsets accordingly
          while (startMin < 0) {
            startOffset--;
            startMin += MINUTES_PER_DAY;
          }
          while (startMin >= MINUTES_PER_DAY) {
            startOffset++;
            startMin -= MINUTES_PER_DAY;
          }
          while (endMin < 0) {
            endOffset--;
            endMin += MINUTES_PER_DAY;
          }
          while (endMin >= MINUTES_PER_DAY) {
            endOffset++;
            endMin -= MINUTES_PER_DAY;
          }

          // Update shared values
          startMinSV.value = startMin;
          endMinSV.value = endMin;
          startDayOffsetSV.value = startOffset;
          endDayOffsetSV.value = endOffset;

          // Update mode to help pointer-event logic for the initiating column
          bodyDragModeSV.value = dayShift !== 0 ? "horizontal" : (deltaMin !== 0 ? "vertical" : "none");

          // Avoid scheduling React state updates every frame to keep animation smooth.
          // We'll mark dirty on gesture end.
        })
        .onEnd(() => {
          "worklet";
          // Snap start time
          let startMin = wSnapTo(startMinSV.value, safeSnap);
          let startOffset = startDayOffsetSV.value;

          // Normalize start after snap
          while (startMin >= MINUTES_PER_DAY) {
            startOffset++;
            startMin -= MINUTES_PER_DAY;
          }
          while (startMin < 0) {
            startOffset--;
            startMin += MINUTES_PER_DAY;
          }

          // Snap end time
          let endMin = wSnapTo(endMinSV.value, safeSnap);
          let endOffset = endDayOffsetSV.value;

          // Normalize end after snap
          while (endMin >= MINUTES_PER_DAY) {
            endOffset++;
            endMin -= MINUTES_PER_DAY;
          }
          while (endMin < 0) {
            endOffset--;
            endMin += MINUTES_PER_DAY;
          }

          startMinSV.value = startMin;
          endMinSV.value = endMin;
          startDayOffsetSV.value = startOffset;
          endDayOffsetSV.value = endOffset;

          // Reset drag mode
          bodyDragModeSV.value = "none";

          scheduleOnRN(markDirty);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [height, dayStartMs, safeSnap, width]
  );

  return (
    <View style={{ width, height: height + LABEL_H }}>
      {/* Track area */}
      <GestureDetector gesture={longPressEmpty}>
        <View
          style={{
            width,
            height,
            backgroundColor: "transparent",
          }}
        >
          {/* Current time indicator (today only) */}
          {isToday && nowMin != null && (
            (() => {
              const innerPadding = 8;
              const effectiveWidth = Math.max(0, width - innerPadding * 2);
              const y = (1 - nowMin / MINUTES_PER_DAY) * height;
              const strokeWidth = 2;
              const dash = 2;
              const gap = 4;
              return (
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: innerPadding,
                    right: innerPadding,
                    top: Math.max(0, Math.min(height, y)) - strokeWidth / 2,
                    height: strokeWidth,
                    zIndex: 6,
                  }}
                >
                  <Svg width={effectiveWidth} height={strokeWidth}>
                    <Line
                      x1={0}
                      y1={strokeWidth / 2}
                      x2={effectiveWidth}
                      y2={strokeWidth / 2}
                      stroke={COLORS.dayBadge}
                      strokeWidth={strokeWidth}
                      strokeDasharray={[dash, gap]}
                      strokeLinecap="round"
                    />
                  </Svg>
                </View>
              );
            })()
          )}

          {/* Existing segments */}
          {rects.map(({ seg, y, h }) => {
            const isFocusedExisting =
              edit && edit.hasSaved && seg.id === edit.id;
            // Hide the original segment when it's being edited (on all days it appears)
            if (isFocusedExisting) return null;

            const dim = !!edit;
            const minTouchHeight = 44; // Minimum touch target (iOS/Android accessibility guidelines)
            const touchPadding = Math.max(0, (minTouchHeight - h) / 2);

            return (
              <GestureDetector key={seg.id} gesture={longPressSegGesture(seg)}>
                <Animated.View
                  style={[
                    {
                      position: "absolute",
                      left: 8,
                      right: 8,
                      top: y - touchPadding,
                      height: h + touchPadding * 2,
                      alignItems: "stretch",
                      justifyContent: "center",
                    },
                  ]}
                >
                  {/* Visual segment - actual size */}
                  <View
                    style={{
                      height: h,
                      borderRadius: 6,
                      backgroundColor: COLORS.segmentBase,
                      opacity: dim ? 0.3 : 1,
                    }}
                  />
              </Animated.View>
            </GestureDetector>
          );
          })}

          {/* Delete selection overlay removed */}

          {/* Spanning segment overlay - renders across all days the segment spans */}
          {edit && (
            <Animated.View style={spanningSegmentStyle}>
              {/* Body - moves both start and end - interactive on all spanned days */}
              {/* Also supports double-tap to delete */}
              <GestureDetector
                gesture={Gesture.Exclusive(gBody, doubleTapDelete)}
              >
                <Animated.View style={[{ flex: 1 }, bodyVisibilityStyle]} />
              </GestureDetector>

              {/* Top handle - render on correct day based on offset */}
              <GestureDetector gesture={gTop}>
                <Animated.View
                  style={[
                    {
                      position: "absolute",
                      top: -HANDLE_TOUCH_SIZE / 2 + 4,
                      left: 0,
                      right: 0,
                      height: HANDLE_TOUCH_SIZE,
                      alignItems: "center",
                      justifyContent: "center",
                    },
                    topHandleVisibilityStyle,
                  ]}
                >
                  <Animated.View
                    style={[
                      {
                        width: "60%",
                        height: HANDLE_SIZE,
                        borderRadius: 6,
                        alignItems: "center",
                        justifyContent: "center",
                      },
                      topHandleStyle,
                    ]}
                  >
                    <Text
                      style={{
                        color: COLORS.white,
                        fontSize: 10,
                        lineHeight: 10,
                      }}
                    >
                      ≡
                    </Text>
                  </Animated.View>
                  {/* Time label for top handle (end time) */}
                  <TimeLabel
                    minutes={endMinSV}
                    position="top"
                    clock24h={clock24h}
                    dayStartMs={dayStartMs}
                    activeDayStartMsSV={activeDayStartMsSV}
                    startDayOffsetSV={startDayOffsetSV}
                    endDayOffsetSV={endDayOffsetSV}
                    bodyDragModeSV={bodyDragModeSV}
                  />
                </Animated.View>
              </GestureDetector>

              {/* Bottom handle - render on correct day based on offset */}
              <GestureDetector gesture={gBottom}>
                <Animated.View
                  style={[
                    {
                      position: "absolute",
                      bottom: -HANDLE_TOUCH_SIZE / 2 + 4,
                      left: 0,
                      right: 0,
                      height: HANDLE_TOUCH_SIZE,
                      alignItems: "center",
                      justifyContent: "center",
                    },
                    bottomHandleVisibilityStyle,
                  ]}
                >
                  <Animated.View
                    style={[
                      {
                        width: "60%",
                        height: HANDLE_SIZE,
                        borderRadius: 6,
                        alignItems: "center",
                        justifyContent: "center",
                      },
                      bottomHandleStyle,
                    ]}
                  >
                    <Text
                      style={{
                        color: COLORS.white,
                        fontSize: 10,
                        lineHeight: 10,
                      }}
                    >
                      ≡
                    </Text>
                  </Animated.View>
                  {/* Time label for bottom handle (start time) */}
                  <TimeLabel
                    minutes={startMinSV}
                    position="bottom"
                    clock24h={clock24h}
                    dayStartMs={dayStartMs}
                    activeDayStartMsSV={activeDayStartMsSV}
                    startDayOffsetSV={startDayOffsetSV}
                    endDayOffsetSV={endDayOffsetSV}
                    bodyDragModeSV={bodyDragModeSV}
                  />
                </Animated.View>
              </GestureDetector>
            </Animated.View>
          )}
        </View>
      </GestureDetector>

      {/* Label */}
      <View
        style={{
          height: LABEL_H,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: COLORS.text, fontSize: 12 }}>
          {shortMonthDay(dateKey)}
        </Text>
        {isToday ? (
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              backgroundColor: COLORS.todayIndicator,
              marginTop: 2,
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

export const DayColumn = memo(DayColumnComponent, (prev, next) => {
  // Avoid unnecessary re-renders when non-relevant props are unchanged
  const samePrimitives =
    prev.dateKey === next.dateKey &&
    prev.dayStartMs === next.dayStartMs &&
    prev.width === next.width &&
    prev.height === next.height &&
    prev.isToday === next.isToday;

  // Rerender when editing session identity flips or dirty state changes
  const sameEdit =
    (prev.edit?.id ?? null) === (next.edit?.id ?? null) &&
    (prev.edit?.isDirty ?? false) === (next.edit?.isDirty ?? false) &&
    (prev.edit?.dayKey ?? null) === (next.edit?.dayKey ?? null);

  // Segments array reference is sufficient — replaced only when the day’s data changes
  const sameSegs = prev.segs === next.segs;

  return samePrimitives && sameEdit && sameSegs;
});
