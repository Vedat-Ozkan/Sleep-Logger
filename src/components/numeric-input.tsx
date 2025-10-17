import { colors } from "@/src/theme/colors";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";

type NumericInputProps = {
  value: number;
  onChangeValue: (value: number) => void;
  min?: number;
  max?: number;
  allowNegative?: boolean;
  placeholder?: string;
  editable?: boolean;
  style?: TextInputProps["style"];
  withControls?: boolean;
  step?: number;
  commitOnChange?: boolean; // if true, emits on each key; default: false (emit on blur or via controls)
};

export default function NumericInput({
  value,
  onChangeValue,
  min,
  max,
  allowNegative = false,
  placeholder = "0",
  editable = true,
  style,
  withControls = true,
  step = 1,
  commitOnChange = false,
}: NumericInputProps) {
  const clamp = (n: number) => {
    let v = n;
    if (min !== undefined && v < min) v = min;
    if (max !== undefined && v > max) v = max;
    return v;
  };

  const toSanitizedText = (t: string) => {
    if (allowNegative) return t.replace(/[^0-9-]/g, "").replace(/(?!^)-/g, "");
    return t.replace(/[^0-9]/g, "");
  };

  const [text, setText] = useState<string>(String(value));

  // Sync incoming value to text when it actually changes externally
  useEffect(() => {
    const cur = Number.parseInt(text || "0", 10);
    if (!Number.isFinite(cur) || cur !== value) {
      setText(String(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = (raw: string) => {
    const sanitized = toSanitizedText(raw);
    if (sanitized === "" || sanitized === "-") {
      // Treat empty/minus as 0 for commit
      onChangeValue(clamp(0));
      setText(String(clamp(0)));
      return;
    }
    const num = Number.parseInt(sanitized, 10);
    if (!Number.isNaN(num)) {
      const c = clamp(num);
      onChangeValue(c);
      setText(String(c));
    }
  };

  const handleChangeText = (raw: string) => {
    const sanitized = toSanitizedText(raw);
    setText(sanitized);
    if (commitOnChange) commit(sanitized);
  };

  const canDecrement = editable && (min === undefined ? true : value > min);
  const canIncrement = editable && (max === undefined ? true : value < max);

  const handleDec = () => {
    if (!canDecrement) return;
    const next = clamp(value - step);
    setText(String(next));
    onChangeValue(next);
  };
  const handleInc = () => {
    if (!canIncrement) return;
    const next = clamp(value + step);
    setText(String(next));
    onChangeValue(next);
  };

  const input = (
    <TextInput
      style={[styles.input, style]}
      value={text}
      onChangeText={handleChangeText}
      onEndEditing={() => commit(text)}
      keyboardType={allowNegative ? "numeric" : "number-pad"}
      placeholder={placeholder}
      placeholderTextColor={colors.textTertiary}
      editable={editable}
    />
  );

  if (!withControls) return input;

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel="Decrement"
        onPress={handleDec}
        disabled={!canDecrement}
        style={[styles.controlBtn, !canDecrement && styles.controlBtnDisabled]}
      >
        <Text style={[styles.controlGlyph, !canDecrement && styles.controlGlyphDisabled]}>–</Text>
      </Pressable>
      {input}
      <Pressable
        accessibilityLabel="Increment"
        onPress={handleInc}
        disabled={!canIncrement}
        style={[styles.controlBtn, !canIncrement && styles.controlBtnDisabled]}
      >
        <Text style={[styles.controlGlyph, !canIncrement && styles.controlGlyphDisabled]}>＋</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  input: {
    backgroundColor: colors.bgPrimary,
    borderWidth: 1,
    borderColor: colors.borderPrimary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 16,
    textAlign: "center",
  },
  controlBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgPrimary,
  },
  controlBtnDisabled: {
    opacity: 0.5,
  },
  controlGlyph: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 18,
  },
  controlGlyphDisabled: {
    color: colors.textSecondary,
  },
});
