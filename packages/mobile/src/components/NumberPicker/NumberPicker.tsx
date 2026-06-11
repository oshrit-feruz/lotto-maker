import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

interface Props {
  poolSize: number;
  selected: number[];
  maxPick: number;
  onToggle: (n: number) => void;
}

export function NumberPicker({ poolSize, selected, maxPick, onToggle }: Props) {
  const numbers = Array.from({ length: poolSize }, (_, i) => i + 1);
  const isComplete = selected.length >= maxPick;

  return (
    <ScrollView contentContainerStyle={styles.grid}>
      {numbers.map((n) => {
        const isSelected = selected.includes(n);
        const disabled = !isSelected && isComplete;
        return (
          <TouchableOpacity
            key={n}
            onPress={() => !disabled && onToggle(n)}
            style={[
              styles.ball,
              isSelected && styles.ballSelected,
              disabled && styles.ballDisabled,
            ]}
            activeOpacity={0.7}
          >
            <Text style={[styles.ballText, isSelected && styles.ballTextSelected]}>
              {n}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 8,
    justifyContent: 'center',
  },
  ball: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  ballSelected: {
    backgroundColor: '#1a56db',
    borderColor: '#1a56db',
  },
  ballDisabled: {
    opacity: 0.35,
  },
  ballText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  ballTextSelected: {
    color: '#fff',
  },
});
