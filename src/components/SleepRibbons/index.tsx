// src/components/SleepRibbons/index.tsx
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Dimensions, FlatList, Pressable, Text, View } from "react-native";

import type { SleepSegment } from "../../lib/db";
import { todayLocalDate } from "../../lib/time";
import {
  DEFAULT_CREATE_MINUTES,
  DEFAULT_SNAP_MINUTES,
} from "./constants";
import { DayColumn } from "./DayColumn";
import { TimeAxisLeft } from "./TimeAxisLeft";
import { useSleepEditor } from "./useSleepEditor";

type SegmentsByDate = Record<string, SleepSegment[]>;

export type SleepRibbonsHandle = {
  scrollToEnd: (animated?: boolean) => void;
  saveAndExitEditMode: () => Promise<void>;
};

type Props = {
  dates: string[]; // chronological: oldest → newest
  segmentsByDate: SegmentsByDate;
  columnWidth?: number;
  columnHeight?: number;
  onPersist?: () => void | Promise<void>; // called after save/delete so parent can reload
  defaultDurationMin?: number;
  snapMinutes?: number;
  clock24h?: boolean;
};

const SleepRibbons = forwardRef<SleepRibbonsHandle, Props>(function Inner(
  {
    dates,
    segmentsByDate,
    columnWidth = 72,
    columnHeight,
    onPersist,
    defaultDurationMin = DEFAULT_CREATE_MINUTES,
    snapMinutes = DEFAULT_SNAP_MINUTES,
    clock24h = true,
  },
  ref
) {
  const today = todayLocalDate();
  const listRef = useRef<FlatList<string>>(null);
  const [showHint, setShowHint] = useState(true);
  const [measuredHeight, setMeasuredHeight] = useState(
    columnHeight ?? Math.max(420, Math.min(560, Math.round(Dimensions.get("window").height * 0.58)))
  );

  // Use measured height if available, otherwise use prop or default
  const activeHeight = columnHeight ?? measuredHeight;

  const {
    edit,
    startMinSV,
    endMinSV,
    isEditingSV,
    activeDayStartMsSV,
    startDayOffsetSV,
    endDayOffsetSV,
    startNewEdit,
    startNewEditWithOffset,
    startExistingEdit,
    markDirty,
    exitEditMode,
    deleteEdit,
    forceExitEditMode,
  } = useSleepEditor(segmentsByDate, onPersist);

  // Refs for stable calls on unmount/blur
  const editRef = useRef(edit);
  const exitEditModeRef = useRef(exitEditMode);
  const forceExitEditModeRef = useRef(forceExitEditMode);
  useEffect(() => {
    editRef.current = edit;
    exitEditModeRef.current = exitEditMode;
    forceExitEditModeRef.current = forceExitEditMode;
  }, [edit, exitEditMode, forceExitEditMode]);

  // Auto-hide hint after 3 seconds when edit mode starts
  useEffect(() => {
    if (edit && showHint) {
      const timer = setTimeout(() => {
        setShowHint(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [edit, showHint]);

  // Scroll to end (today) on mount
  useEffect(() => {
    if (dates.length > 0) {
      const timer = setTimeout(() => {
        const last = dates.length - 1;
        try {
          listRef.current?.scrollToIndex({
            index: last,
            animated: false,
            viewPosition: 1,
          });
        } catch {
          listRef.current?.scrollToOffset({
            offset: last * columnWidth,
            animated: false,
          });
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [dates.length, columnWidth]);

  // Save and exit edit mode when component unmounts (e.g., tab change)
  useEffect(() => {
    return () => {
      if (editRef.current) {
        // Call async exitEditMode to save (fire and forget)
        exitEditModeRef.current();
        // Immediately clear the UI state synchronously
        forceExitEditModeRef.current();
      }
    };
  }, []); // Only run cleanup on unmount

  // expose scrollToEnd to parent
  useImperativeHandle(
    ref,
    () => ({
      scrollToEnd(animated = false) {
        if (!dates.length) return;
        const last = dates.length - 1;
        try {
          listRef.current?.scrollToIndex({
            index: last,
            animated,
            viewPosition: 1,
          });
        } catch {
          listRef.current?.scrollToOffset({
            offset: last * columnWidth,
            animated,
          });
        }
      },
      async saveAndExitEditMode() {
        if (editRef.current) {
          const ok = await exitEditModeRef.current();
          if (!ok) {
            forceExitEditModeRef.current();
          }
        }
      },
    }),
    [dates.length, columnWidth]
  );

  // No jiggle animation - edit mode is clear enough with dimmed background and handles


  return (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        paddingLeft: 6,
        paddingRight: 6,
        paddingTop: 6,
      }}
      onLayout={(e) => {
        if (!columnHeight) {
          // Subtract padding and label height to get actual available height for ribbons
          const availableHeight = e.nativeEvent.layout.height - 12 - 24; // top padding + label height
          setMeasuredHeight(availableHeight);
        }
      }}
    >
      {/* Background overlay when editing - dims everything */}
      {edit && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: "rgba(0,0,0,0.4)",
            zIndex: 1,
          }}
        />
      )}

      <TimeAxisLeft height={activeHeight} clock24h={clock24h} />

      {/* Days */}
      <View style={{ flex: 1, zIndex: 2 }}>
        <FlatList
          ref={listRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          removeClippedSubviews
          windowSize={7}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={50}
          data={dates}
          keyExtractor={(d) => d}
          initialScrollIndex={dates.length > 0 ? dates.length - 1 : 0}
          getItemLayout={(_, index) => ({
            length: columnWidth,
            offset: index * columnWidth,
            index,
          })}
          renderItem={({ item }) => (
            <DayColumn
              dateKey={item}
              dayStartMs={new Date(`${item}T00:00:00`).getTime()}
              segs={segmentsByDate[item] || []}
              width={columnWidth}
              height={activeHeight}
              isToday={item === today}
              edit={edit}
              startMinSV={startMinSV}
              endMinSV={endMinSV}
              isEditingSV={isEditingSV}
              activeDayStartMsSV={activeDayStartMsSV}
              startDayOffsetSV={startDayOffsetSV}
              endDayOffsetSV={endDayOffsetSV}
              startNewEdit={startNewEdit}
              startNewEditWithOffset={startNewEditWithOffset}
              startExistingEdit={startExistingEdit}
              markDirty={markDirty}
              deleteEdit={deleteEdit}
              defaultDurationMin={defaultDurationMin}
              snapMinutes={snapMinutes}
              clock24h={clock24h}
            />
          )}
        />

        {/* Save button - visible during edit mode */}
        {edit && (
          <Pressable
            onPress={exitEditMode}
            accessibilityRole="button"
            accessibilityLabel="Save changes"
            style={{
              position: "absolute",
              bottom: 20,
              right: 20,
              backgroundColor: "#10b981",
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 24,
              elevation: 4,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 4,
              zIndex: 10,
            }}
          >
            <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>
              Save
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
});

export default SleepRibbons;
