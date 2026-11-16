import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, radii, rtl } from '../../theme/index.js';

const UNITS = [
  { label: 'ימים', ms: 86_400_000 },
  { label: 'שעות', ms: 3_600_000 },
  { label: 'דקות', ms: 60_000 },
  { label: 'שניות', ms: 1_000 },
] as const;

function split(remaining: number): number[] {
  let rest = Math.max(0, remaining);
  return UNITS.map((u) => {
    const v = Math.floor(rest / u.ms);
    rest -= v * u.ms;
    return v;
  });
}

/**
 * Days / hours / minutes / seconds in four pine tiles with sun digits, read
 * right to left like the website's countdown. Purely visual: the caller ticks
 * `remainingMs` and prints the exact time next to it.
 */
export function Countdown({ remainingMs }: Readonly<{ remainingMs: number | null }>) {
  const parts = remainingMs === null ? null : split(remainingMs);
  const spoken = parts
    ? UNITS.map((u, i) => `${parts[i]} ${u.label}`).join(', ')
    : undefined;
  return (
    <View style={styles.row} accessible accessibilityRole="timer" accessibilityLabel={spoken}>
      {UNITS.map((u, i) => (
        <View key={u.label} style={styles.cell}>
          <Text style={styles.value} allowFontScaling={false}>
            {parts ? String(parts[i]).padStart(2, '0') : '--'}
          </Text>
          <Text style={styles.unit}>{u.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: rtl.row, gap: 8 },
  cell: {
    flex: 1,
    backgroundColor: colors.pine,
    borderRadius: radii.sm,
    paddingTop: 10,
    paddingBottom: 7,
    alignItems: 'center',
  },
  value: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 34,
    color: colors.sun,
    fontVariant: ['tabular-nums'],
  },
  unit: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 16, color: colors.onPineMuted, marginTop: 2 },
});
