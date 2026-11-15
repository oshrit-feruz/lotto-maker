import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { BallButton } from '../ui/index.js';
import { rtl, touch } from '../../theme/index.js';

interface Props {
  poolSize: number;
  selected: number[];
  maxPick: number;
  onToggle: (n: number) => void;
  /** The strong-number row: plum balls instead of sun. */
  strong?: boolean;
}

const GAP = 4;

/**
 * The ball grid, read left to right like the paper form. Seven balls a row
 * when each can be at least 44pt, otherwise six.
 */
export function NumberPicker({ poolSize, selected, maxPick, onToggle, strong = false }: Props) {
  const [width, setWidth] = useState(0);
  const numbers = Array.from({ length: poolSize }, (_, i) => i + 1);
  const isComplete = selected.length >= maxPick;

  const fit = (cols: number) => Math.floor((width - GAP * (cols - 1)) / cols);
  const cols = fit(7) >= touch ? 7 : 6;
  const size = Math.min(52, fit(cols));

  return (
    <View
      style={styles.grid}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="list"
    >
      {width > 0 && numbers.map((n) => {
        const isSelected = selected.includes(n);
        const disabled = !isSelected && isComplete;
        return (
          <BallButton
            key={n}
            n={n}
            size={size}
            selected={isSelected}
            disabled={disabled}
            strong={strong}
            onPress={onToggle}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: rtl.ltrRow,
    flexWrap: 'wrap',
    gap: GAP,
    minHeight: touch,
  },
});
