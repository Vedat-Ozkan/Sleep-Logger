import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { colors } from "@/src/theme/colors";

type Props = {
  title: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  color?: string;
  style?: ViewStyle;
  testID?: string;
};

export default function SolidButton({ title, onPress, disabled, color = colors.accentGreen, style, testID }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: color, opacity: disabled ? 0.6 : (pressed ? 0.85 : 1) },
        style,
      ]}
    >
      <Text style={styles.label}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 0,
  },
  label: {
    color: "#ffffff",
    fontWeight: "700",
  },
});
