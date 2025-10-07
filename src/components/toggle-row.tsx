import { colors } from "@/src/theme/colors";
import { StyleSheet, Switch, Text, View } from "react-native";

type ToggleRowProps = {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
};

export default function ToggleRow({ label, value, onValueChange }: ToggleRowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.borderPrimary, true: colors.accentGreen }}
        thumbColor={colors.white}
        ios_backgroundColor={colors.borderPrimary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});
