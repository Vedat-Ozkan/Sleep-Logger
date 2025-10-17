import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// Toast handled by showError/showInfo/showSuccess helpers
import { showError, showInfo, showSuccess } from "@/src/lib/toast";

import Card from "@/src/components/card";
import NumericInput from "@/src/components/numeric-input";
import SolidButton from "@/src/components/solid-button";
import ToggleRow from "@/src/components/toggle-row";
import {
  DEFAULT_EDITOR_PREFS,
  EditorPrefs,
  loadEditorPrefs,
  resetSleepData,
  saveEditorPrefs,
} from "@/src/lib/db";
import { useClockPref } from "@/src/lib/useClockPref";
import { usePhaseShift } from "@/src/lib/usePhaseShift";
import { colors } from "@/src/theme/colors";
import * as WebBrowser from "expo-web-browser";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [editorPrefs, setEditorPrefs] = useState<EditorPrefs>(DEFAULT_EDITOR_PREFS);
  const [loading, setLoading] = useState(true);
  const [dataBusy, setDataBusy] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const { clock24h, updateClock24h } = useClockPref();
  const phaseShift = usePhaseShift();
  const editorSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const editor = await loadEditorPrefs();
        setEditorPrefs(editor);
      } catch (error) {
        console.warn("Failed to load settings", error);
        showError("Could not load settings", error);
      } finally {
        setLoading(false);
      }
    })();

    // Cleanup timeout on unmount
    return () => {
      if (editorSaveTimeoutRef.current) {
        clearTimeout(editorSaveTimeoutRef.current);
      }
    };
  }, []);

  const persistEditor = useCallback((next: EditorPrefs) => {
    setEditorPrefs(next);

    // Clear existing timeout
    if (editorSaveTimeoutRef.current) {
      clearTimeout(editorSaveTimeoutRef.current);
    }

    // Debounce the save operation
    editorSaveTimeoutRef.current = setTimeout(async () => {
      setEditorBusy(true);
      try {
        await saveEditorPrefs(next);
      } catch (error) {
        showError("Could not update defaults", error);
        const latest = await loadEditorPrefs();
        setEditorPrefs(latest);
      } finally {
        setEditorBusy(false);
      }
    }, 500);
  }, []);

  const shareBackup = useCallback(async () => {
    try {
      setDataBusy(true);
      const { exportToCSV } = await import('@/src/lib/csvExport');
      const csvContent = await exportToCSV();
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const filename = `sleep-backup-${timestamp}.csv`;

      // Web fallback: trigger client-side download (no FS needed)
      if (Platform.OS === 'web') {
        try {
          const g: any = globalThis as any;
          const hasBlob = typeof g.Blob === 'function';
          if (hasBlob && (g.URL || g.webkitURL)) {
            const blob = new g.Blob([csvContent], { type: 'text/csv;charset=utf-8' });
            const url = (g.URL || g.webkitURL).createObjectURL(blob);
            const a = g.document?.createElement('a');
            if (a) {
              a.href = url;
              a.download = filename;
              g.document.body.appendChild(a);
              a.click();
              g.document.body.removeChild(a);
              (g.URL || g.webkitURL).revokeObjectURL(url);
              showSuccess('Exported', 'Downloaded CSV');
            } else {
              const dataUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(csvContent)}`;
              await WebBrowser.openBrowserAsync(dataUrl);
            }
          } else {
            const dataUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(csvContent)}`;
            await WebBrowser.openBrowserAsync(dataUrl);
          }
        } finally {
          setDataBusy(false);
        }
        return;
      }

      // Native: write to document directory and share using new File API
      try {
        const file = new File(Paths.document, filename);
        await file.write(csvContent);

        const available = await Sharing.isAvailableAsync();
        if (!available) {
          showInfo("Sharing not available", "File saved to documents");
        } else {
          await Sharing.shareAsync(file.uri, {
            mimeType: "text/csv",
            dialogTitle: "Save sleep data backup",
          });
        }
      } catch (fsError) {
        // Fallback to text sharing if file system fails
        if (Platform.OS !== 'web') {
          try {
            await Share.share({ title: filename, message: csvContent });
            showSuccess('Exported', 'Shared CSV as text');
          } catch {
            throw fsError;
          }
        } else {
          throw fsError;
        }
      }
    } catch (error) {
      // Common failure: open segments should not block export (we skip them)
      showError("Export failed", error);
    } finally {
      setDataBusy(false);
    }
  }, []);

  const importBackup = useCallback(async () => {
    try {
      setDataBusy(true);

      // Use document picker to select a CSV file
      const picker = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/vnd.ms-excel"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (picker.canceled || !picker.assets?.length) {
        setDataBusy(false);
        return;
      }

      const asset = picker.assets[0];
      const file = new File(asset.uri);
      const contents = await file.text();

      if (!contents || contents.trim().length === 0) {
        showError("Empty file", "The selected file is empty");
        return;
      }

      const { importFromCSV } = await import('@/src/lib/csvExport');
      const result = await importFromCSV(contents);

      if (result.inserted === 0 && result.updated === 0) {
        showInfo("No data imported", result.invalid > 0 ? `${result.invalid} invalid rows skipped` : "File may be empty or invalid");
      } else {
        showSuccess("Import complete", `Added ${result.inserted}, updated ${result.updated}${result.invalid > 0 ? `, skipped ${result.invalid}` : ''}`);
      }
    } catch (error) {
      showError("Import failed", error);
    } finally {
      setDataBusy(false);
    }
  }, []);

  const confirmDeleteData = useCallback(() => {
    Alert.alert(
      "Delete All Data?",
      "This will permanently delete all your sleep history. This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setDataBusy(true);
              await resetSleepData();
              showSuccess("All data cleared", "Sleep history removed from this device");
            } catch (error) {
              showError("Reset failed", error);
            } finally {
              setDataBusy(false);
            }
          },
        },
      ]
    );
  }, []);


  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading settings…</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Card title="Display">
          <ToggleRow
            label="24-hour clock"
            value={clock24h}
            onValueChange={updateClock24h}
          />
        </Card>

        <Card title="Standard sleep length">
          <Text style={styles.label}>When creating a new sleep segment</Text>
          <View style={styles.timeInputRow}>
            <View style={styles.timeInputGroup}>
              <Text style={styles.timeInputLabel}>Hours</Text>
              <NumericInput
                value={Math.floor(editorPrefs.defaultSegmentLengthMin / 60)}
                onChangeValue={(hours) => {
                  const currentMinutes =
                    editorPrefs.defaultSegmentLengthMin % 60;
                  const totalMinutes = hours * 60 + currentMinutes;
                  if (totalMinutes <= 24 * 60) {
                    persistEditor({
                      ...editorPrefs,
                      defaultSegmentLengthMin: totalMinutes,
                    });
                  }
                }}
                min={0}
                max={24}
                placeholder="8"
              />
            </View>
            <View style={styles.timeInputGroup}>
              <Text style={styles.timeInputLabel}>Minutes</Text>
              <NumericInput
                value={editorPrefs.defaultSegmentLengthMin % 60}
                onChangeValue={(minutes) => {
                  const currentHours = Math.floor(
                    editorPrefs.defaultSegmentLengthMin / 60
                  );
                  const totalMinutes = currentHours * 60 + minutes;
                  if (totalMinutes <= 24 * 60) {
                    persistEditor({
                      ...editorPrefs,
                      defaultSegmentLengthMin: totalMinutes,
                    });
                  }
                }}
                min={0}
                max={59}
                placeholder="0"
              />
            </View>
          </View>
        </Card>

        <Card title="Phase shift">
          <Text style={styles.label}>
            Shift all reminders and prompts each day by set amount
          </Text>
          <View style={styles.phaseShiftRow}>
            <Text style={styles.phaseShiftLabel}>Daily shift:</Text>
            <NumericInput
              value={phaseShift.shiftMinutesPerDay}
              onChangeValue={(value) => phaseShift.setShiftMinutes(value)}
              min={-1440}
              max={1440}
              allowNegative
              placeholder="0"
              style={styles.phaseShiftInput}
            />
          </View>
        </Card>

        <Card title="Data management">
          <View style={styles.actions}>
            <SolidButton
              title={dataBusy ? "Working…" : "Export CSV"}
              onPress={shareBackup}
              disabled={dataBusy}
            />
            <SolidButton
              title={dataBusy ? "Working…" : "Import CSV"}
              onPress={importBackup}
              disabled={dataBusy}
            />
            <SolidButton
              title={dataBusy ? "Working…" : "Delete all data"}
              onPress={confirmDeleteData}
              disabled={dataBusy}
            />
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    gap: 20,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgPrimary,
  },
  loadingText: {
    color: colors.textSecondary,
  },
  title: {
    color: colors.textPrimary,
    fontWeight: "800",
    fontSize: 18,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  note: {
    color: colors.textTertiary,
    fontSize: 12,
  },
  actions: {
    gap: 12,
  },
  textInput: {
    backgroundColor: colors.bgPrimary,
    borderWidth: 1,
    borderColor: colors.borderPrimary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 16,
  },
  timeInputRow: {
    flexDirection: "row",
    gap: 12,
  },
  timeInputGroup: {
    flex: 1,
    gap: 4,
  },
  timeInputLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  phaseShiftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  phaseShiftLabel: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  phaseShiftInput: {
    backgroundColor: colors.bgPrimary,
    borderWidth: 1,
    borderColor: colors.borderPrimary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.textPrimary,
    fontSize: 16,
    textAlign: "center",
    minWidth: 60,
  },
  phaseShiftUnit: {
    color: colors.textTertiary,
    fontSize: 12,
  },
});
