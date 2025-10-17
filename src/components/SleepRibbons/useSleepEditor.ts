// src/components/SleepRibbons/useSleepEditor.ts
import { useCallback, useEffect, useState } from "react";
// no Alert confirmations for delete per product decision
import { useSharedValue } from "react-native-reanimated";
import Toast from "react-native-toast-message";

import type { SleepSegment } from "../../lib/db";
import { deleteSegment, upsertSegment } from "../../lib/db";
import { localDateFromDayAndMinutes } from "../../lib/time";

type SegmentsByDate = Record<string, SleepSegment[]>;

// Helper to get day key with offset applied
function getDateKeyFromOffset(baseDayKey: string, dayOffset: number): string {
  const [year, month, day] = baseDayKey.split("-").map(Number);
  const baseDate = new Date(year, month - 1, day);
  baseDate.setDate(baseDate.getDate() + dayOffset);

  const y = baseDate.getFullYear();
  const m = String(baseDate.getMonth() + 1).padStart(2, '0');
  const d = String(baseDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

type EditingSession = {
  id: string;
  hasSaved: boolean;
  dayKey: string;
  isDirty: boolean;
  lastCommittedStart: number;
  lastCommittedEnd: number;
  isCommitting?: boolean;
};

export function useSleepEditor(
  segmentsByDate: SegmentsByDate,
  onPersist?: () => void | Promise<void>
) {
  const [edit, setEdit] = useState<EditingSession | null>(null);

  // Shared values for UI thread
  const startMinSV = useSharedValue(0);
  const endMinSV = useSharedValue(0);
  const isEditingSV = useSharedValue(0);
  const activeDayStartMsSV = useSharedValue(0);
  // Day offsets for handles (0 = origin day, -1 = prev day, +1 = next day, etc.)
  const startDayOffsetSV = useSharedValue(0);
  const endDayOffsetSV = useSharedValue(0);
  // Track drag mode globally across all columns
  const bodyDragModeSV = useSharedValue<"none" | "horizontal" | "vertical">("none");

  // Overlap check - check all days that the segment spans
  const checkOverlap = useCallback(
    (dayKey: string, start: Date, end: Date, excludeId?: string): boolean => {
      if (end <= start) return true;

      // Check all segments across all days since segments can span multiple days now
      const allSegments = Object.values(segmentsByDate).flat();

      for (const seg of allSegments) {
        if (excludeId && seg.id === excludeId) continue;
        // Skip segments without end_utc (open segments)
        if (!seg.end_utc) continue;

        try {
          const a1 = new Date(seg.start_utc);
          const a2 = new Date(seg.end_utc);

          // Validate dates
          if (isNaN(a1.getTime()) || isNaN(a2.getTime())) {
            console.warn('Invalid date in segment:', seg.id);
            continue;
          }

          if (
            Math.max(a1.getTime(), start.getTime()) <
            Math.min(a2.getTime(), end.getTime())
          ) {
            return true;
          }
        } catch (err) {
          console.warn('Error checking segment overlap:', err);
          continue;
        }
      }

      return false;
    },
    [segmentsByDate]
  );

  // Commit current edit
  const commitEdit = useCallback(async (): Promise<boolean> => {
    if (!edit) return false;

    // Mark as committing to hide the original segment immediately
    setEdit((prev) => (prev ? { ...prev, isCommitting: true } : prev));

    try {
      const sMin = startMinSV.value;
      const eMin = endMinSV.value;
      const sDayOffset = startDayOffsetSV.value;
      const eDayOffset = endDayOffsetSV.value;

      // Calculate actual dates using day offsets
      // Start: apply day offset to base day, then add minutes
      const startDayKey = getDateKeyFromOffset(edit.dayKey, sDayOffset);
      const endDayKey = getDateKeyFromOffset(edit.dayKey, eDayOffset);

      const start = localDateFromDayAndMinutes(startDayKey, sMin);
      const end = localDateFromDayAndMinutes(endDayKey, eMin);

      if (end <= start) {
        setEdit((prev) => (prev ? { ...prev, isCommitting: false } : prev));
        Toast.show({
          type: "error",
          text1: "Invalid time",
          text2: "End time must be after start time",
        });
        return false;
      }

      if (
        checkOverlap(
          edit.dayKey,
          start,
          end,
          edit.hasSaved ? edit.id : undefined
        )
      ) {
        setEdit((prev) => (prev ? { ...prev, isCommitting: false } : prev));
        Toast.show({
          type: "error",
          text1: "Overlap detected",
          text2: "This sleep overlaps another entry",
        });
        return false;
      }

      await upsertSegment({
        id: edit.id,
        start_utc: start.toISOString(),
        end_utc: end.toISOString(),
        source: "user",
      });

      setEdit((prev) =>
        prev && prev.id === edit.id
          ? {
              ...prev,
              hasSaved: true,
              isDirty: false,
              lastCommittedStart: sMin,
              lastCommittedEnd: eMin,
              isCommitting: true,
            }
          : prev
      );

      // Trigger parent refresh without blocking UI responsiveness
      try {
        void onPersist?.();
      } catch {}

      return true;
    } catch (err: any) {
      Toast.show({
        type: "error",
        text1: "Error",
        text2: String(err?.message ?? err),
      });

      // Revert to last committed values on error
      if (
        edit.lastCommittedStart !== undefined &&
        edit.lastCommittedEnd !== undefined
      ) {
        startMinSV.value = edit.lastCommittedStart;
        endMinSV.value = edit.lastCommittedEnd;
        setEdit((prev) => (prev ? { ...prev, isDirty: false, isCommitting: false } : prev));
      }

      return false;
    }
  }, [edit, checkOverlap, onPersist, startMinSV, endMinSV, startDayOffsetSV, endDayOffsetSV]);

  // Start editing new segment
  const startNewEdit = useCallback(
    (
      dayKey: string,
      startMin: number,
      endMin: number,
      dayStartMs: number
    ) => {
      const id =
        (globalThis.crypto?.randomUUID?.() as string) ??
        `${Date.now()}-${Math.random()}`;

      // Seed shared values
      startMinSV.value = startMin;
      endMinSV.value = endMin;
      activeDayStartMsSV.value = dayStartMs;
      isEditingSV.value = 1;
      startDayOffsetSV.value = 0;
      endDayOffsetSV.value = 0;

      setEdit({
        id,
        hasSaved: false,
        dayKey,
        isDirty: true,
        lastCommittedStart: startMin,
        lastCommittedEnd: endMin,
      });
    },
    [
      startMinSV,
      endMinSV,
      activeDayStartMsSV,
      isEditingSV,
      startDayOffsetSV,
      endDayOffsetSV,
    ]
  );

  // Start editing new segment with custom day offsets (for overnight sleep)
  const startNewEditWithOffset = useCallback(
    (
      dayKey: string,
      startMin: number,
      endMin: number,
      dayStartMs: number,
      startDayOffset: number,
      endDayOffset: number
    ) => {
      const id =
        (globalThis.crypto?.randomUUID?.() as string) ??
        `${Date.now()}-${Math.random()}`;

      // Seed shared values with custom offsets
      startMinSV.value = startMin;
      endMinSV.value = endMin;
      activeDayStartMsSV.value = dayStartMs;
      isEditingSV.value = 1;
      startDayOffsetSV.value = startDayOffset;
      endDayOffsetSV.value = endDayOffset;

      setEdit({
        id,
        hasSaved: false,
        dayKey,
        isDirty: true,
        lastCommittedStart: startMin,
        lastCommittedEnd: endMin,
      });
    },
    [
      startMinSV,
      endMinSV,
      activeDayStartMsSV,
      isEditingSV,
      startDayOffsetSV,
      endDayOffsetSV,
    ]
  );

  // Auto-commit new segments after state updates
  useEffect(() => {
    if (!edit || edit.hasSaved) return;

    let isCancelled = false;

    const commitNewSegment = async () => {
      // Read the day offsets from shared values
      const sDayOffset = startDayOffsetSV.value;
      const eDayOffset = endDayOffsetSV.value;

      // Calculate actual dates using day offsets
      const startDayKey = getDateKeyFromOffset(edit.dayKey, sDayOffset);
      const endDayKey = getDateKeyFromOffset(edit.dayKey, eDayOffset);

      const start = localDateFromDayAndMinutes(startDayKey, edit.lastCommittedStart);
      const end = localDateFromDayAndMinutes(endDayKey, edit.lastCommittedEnd);

      if (checkOverlap(edit.dayKey, start, end)) {
        Toast.show({
          type: "error",
          text1: "Cannot create",
          text2: "This would overlap an existing segment",
        });
        if (!isCancelled) {
          setEdit(null);
          isEditingSV.value = 0;
        }
        return;
      }

      try {
        await upsertSegment({
          id: edit.id,
          start_utc: start.toISOString(),
          end_utc: end.toISOString(),
          source: "user",
        });

        if (!isCancelled) {
          setEdit((prev) =>
            prev && prev.id === edit.id
              ? { ...prev, hasSaved: true, isDirty: true } // Keep dirty so user can adjust after creation
              : prev
          );
          onPersist?.();
        }
      } catch (err: any) {
        Toast.show({
          type: "error",
          text1: "Error creating segment",
          text2: String(err?.message ?? err),
        });
        if (!isCancelled) {
          setEdit(null);
          isEditingSV.value = 0;
        }
      }
    };

    commitNewSegment();

    return () => {
      isCancelled = true;
    };
  }, [edit, checkOverlap, onPersist, isEditingSV, startDayOffsetSV, endDayOffsetSV]);

  // Start editing existing segment
  const startExistingEdit = useCallback(
    (seg: SleepSegment, dayKey: string, dayStartMs: number) => {
      // Validate segment has end_utc
      if (!seg.end_utc) {
        Toast.show({
          type: "error",
          text1: "Cannot edit",
          text2: "This segment is still open (no end time)",
        });
        return;
      }

      try {
        const startTime = new Date(seg.start_utc);
        const endTime = new Date(seg.end_utc);

        // Validate dates
        if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
          Toast.show({
            type: "error",
            text1: "Error",
            text2: "Invalid dates in segment",
          });
          return;
        }

        // Calculate the start day and end day
        const startDay = new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate());
        const endDay = new Date(endTime.getFullYear(), endTime.getMonth(), endTime.getDate());
        const startDayMs = startDay.getTime();
        const endDayMs = endDay.getTime();

        // Calculate day offsets relative to the day we're editing from
        const startDayOffset = Math.round((startDayMs - dayStartMs) / 86400000);
        const endDayOffset = Math.round((endDayMs - dayStartMs) / 86400000);

        // Calculate minutes within each respective day
        const startMin = startTime.getHours() * 60 + startTime.getMinutes();
        const endMin = endTime.getHours() * 60 + endTime.getMinutes();

        // Set the origin day to where the segment starts
        activeDayStartMsSV.value = dayStartMs;
        startMinSV.value = startMin;
        endMinSV.value = endMin;
        startDayOffsetSV.value = startDayOffset;
        endDayOffsetSV.value = endDayOffset;
        isEditingSV.value = 1;

        setEdit({
          id: seg.id,
          hasSaved: true,
          dayKey,
          isDirty: false,
          lastCommittedStart: startMin,
          lastCommittedEnd: endMin,
        });
      } catch (err: any) {
        Toast.show({
          type: "error",
          text1: "Error",
          text2: String(err?.message ?? err),
        });
      }
    },
    [startMinSV, endMinSV, activeDayStartMsSV, isEditingSV, startDayOffsetSV, endDayOffsetSV]
  );

  // Mark as dirty
  const markDirty = useCallback(() => {
    setEdit((prev) => (prev ? { ...prev, isDirty: true } : prev));
  }, []);

  // Exit edit mode
  const exitEditMode = useCallback(async (): Promise<boolean> => {
    if (!edit) return true;

    if (edit.isDirty) {
      const success = await commitEdit();
      if (!success) return false;
    }

    // Clear edit state after commit (commitEdit now waits for parent refresh)
    setEdit(null);
    isEditingSV.value = 0;
    return true;
  }, [edit, commitEdit, isEditingSV]);

  // Delete segment (no confirmation)
  const deleteEdit = useCallback(async () => {
    if (!edit) {
      return;
    }
    if (!edit.hasSaved) {
      setEdit(null);
      isEditingSV.value = 0;
      return;
    }
    try {
      await deleteSegment(edit.id);
      setEdit(null);
      isEditingSV.value = 0;
      onPersist?.();
      Toast.show({ type: "success", text1: "Deleted", text2: "Sleep entry removed" });
    } catch (e: any) {
      Toast.show({ type: "error", text1: "Error", text2: String(e?.message ?? e) });
    }
  }, [edit, isEditingSV, onPersist]);

  // Force clear edit mode synchronously (for unmount)
  const forceExitEditMode = useCallback(() => {
    setEdit(null);
    isEditingSV.value = 0;
  }, [isEditingSV]);

  return {
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
    exitEditMode,
    deleteEdit,
    forceExitEditMode,
  };
}
