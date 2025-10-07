import { PropsWithChildren } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { colors } from "@/src/theme/colors";

type CardProps = PropsWithChildren<{
  title?: string;
  headerRight?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}>;

export default function Card({ title, headerRight, style, children }: CardProps) {
  return (
    <View style={[styles.card, style]}>
      {(title || headerRight) && (
        <View style={styles.cardHeader}>
          {title ? <Text style={styles.cardTitle}>{title}</Text> : <View />}
          {headerRight ?? null}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.borderPrimary,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    backgroundColor: colors.bgSecondary,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 16,
  },
});

