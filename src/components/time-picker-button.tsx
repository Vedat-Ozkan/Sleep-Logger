import { useMemo, useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";

import { colors } from "@/src/theme/colors";
import { minutesToHmPref } from "@/src/lib/time";
import type { Hm } from "@/src/lib/reminders";
import SolidButton from "@/src/components/solid-button";

type Props = {
  time: Hm;
  clock24h: boolean;
  onConfirm: (d: Date) => void | Promise<void>;
  color?: string;
};

export default function TimePickerButton({ time, clock24h, onConfirm, color = colors.accentGreen }: Props) {
  const [open, setOpen] = useState(false);
  const label = useMemo(
    () => minutesToHmPref(time.hour * 60 + time.minute, clock24h),
    [time, clock24h]
  );

  return (
    <>
      <SolidButton title={label} onPress={() => setOpen(true)} color={color} />
      {open && (
        <DateTimePicker
          value={new Date(0, 0, 0, time.hour, time.minute)}
          mode="time"
          display="default"
          onChange={(_, d) => {
            setOpen(false);
            if (d) onConfirm(d);
          }}
        />
      )}
    </>
  );
}
