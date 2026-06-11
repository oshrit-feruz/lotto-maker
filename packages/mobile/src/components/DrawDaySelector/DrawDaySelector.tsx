import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { DrawDay } from '@lotto-maker/shared';

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
          <TouchableOpacity
            key={day}
            onPress={() => onToggle(day)}
            style={[styles.dayBtn, isSelected && styles.dayBtnSelected]}
          >
            <Text style={[styles.dayText, isSelected && styles.dayTextSelected]}>
              {DAY_LABELS[day]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
  dayBtn: {
    width: 52, height: 52, borderRadius: 26,
    borderWidth: 2, borderColor: '#d1d5db',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff',
  },
  dayBtnSelected: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  dayText: { fontSize: 18, fontWeight: '700', color: '#374151' },
  dayTextSelected: { color: '#fff' },
});
