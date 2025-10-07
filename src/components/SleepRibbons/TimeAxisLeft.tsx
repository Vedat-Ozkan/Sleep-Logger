// src/components/SleepRibbons/TimeAxisLeft.tsx
import { memo, useMemo } from "react";
import { Text, View } from "react-native";

import { COLORS, HOURS_PER_DAY } from "./constants";

type Props = {
  height: number;
  clock24h?: boolean;
};

function TimeAxisLeftComponent({ height, clock24h = true }: Props) {
  const labels = useMemo(() => {
    const hours = [HOURS_PER_DAY, 20, 16, 12, 8, 4, 0];
    const fmt = (h: number) => {
      if (clock24h) {
        const hh = String(h % 24).padStart(2, "0");
        return `${hh}:00`;
      }
      const mapped = h % 24;
      const am = mapped < 12;
      const hour12 = mapped % 12 === 0 ? 12 : mapped % 12;
      const suffix = am ? "AM" : "PM";
      return `${hour12} ${suffix}`;
    };
    return hours.map((h) => ({ h, label: fmt(h), yPos: (1 - h / HOURS_PER_DAY) * height }));
  }, [clock24h, height]);

  return (
    <View style={{ width: 40 }}>
      <View style={{ height, position: "relative" }}>
        {labels.map(({ h, label, yPos }) => (
          <View
            key={h}
            style={{ position: "absolute", top: yPos - 6, left: 0, width: 40 }}
          >
            <Text
              style={{ color: COLORS.axis, fontSize: 12 }}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
      
    </View>
  );
}

TimeAxisLeftComponent.displayName = 'TimeAxisLeft';

export const TimeAxisLeft = memo(TimeAxisLeftComponent);
