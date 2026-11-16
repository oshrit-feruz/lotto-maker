import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { DrawDay } from '@lotto-maker/shared';
import { colors, fonts, rtl } from '../../theme/index.js';

const DAY_LABELS: Record<DrawDay, string> = {
  tue: 'ג׳',
  thu: 'ה׳',
  sat: 'ש׳',
};

interface Props {
  selected: DrawDay[];
  onToggle: (day: DrawDay) => void;
}

export function DrawDaySelector({ selected, onToggle }: Props) {
  const days: DrawDay[] = ['tue', 'thu', 'sat'];
  return (
    <View style={styles.row}>
      {days.map((day) => {
        const isSelected = selected.includes(day);
        return (
          <Pressable
            key={day}
            onPress={() => onToggle(day)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
            style={[styles.dayBtn, isSelected && styles.dayBtnSelected]}
          >
            <Text style={[styles.dayText, isSelected && styles.dayTextSelected]}>
              {DAY_LABELS[day]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: rtl.row, gap: 12, justifyContent: 'center' },
  dayBtn: {
    width: 52, height: 52, borderRadius: 26,
    borderWidth: 2, borderColor: colors.pickerBorder,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  dayBtnSelected: { backgroundColor: colors.pine, borderColor: colors.pine },
  dayText: { fontFamily: fonts.display, fontSize: 18, color: colors.pineDeep },
  dayTextSelected: { color: colors.sun },
});
