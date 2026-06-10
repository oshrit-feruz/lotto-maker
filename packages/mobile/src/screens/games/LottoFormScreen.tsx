import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert,
} from 'react-native';
import { GAME_RULES, GAME_DISPLAY_NAMES, GAME_BASE_PRICE, SERVICE_FEE } from '@lotto-maker/shared';
import { NumberPicker } from '../../components/NumberPicker/NumberPicker.js';
import { useCartStore } from '../../store/cart.store.js';
import { nanoid } from 'nanoid/non-secure';

interface Props {
  onAddedToCart: () => void;
}

export function LottoFormScreen({ onAddedToCart }: Props) {
  const rules = GAME_RULES.lotto;
  const [numbers, setNumbers] = useState<number[]>([]);
  const [strongNumber, setStrongNumber] = useState<number | null>(null);
  const addItem = useCartStore((s) => s.addItem);

  function toggleNumber(n: number) {
    setNumbers((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : prev.length < rules.pickCount ? [...prev, n] : prev,
    );
  }

  function quickPick() {
    const pool = Array.from({ length: rules.poolSize }, (_, i) => i + 1);
    const picked: number[] = [];
    while (picked.length < rules.pickCount) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0]!);
    }
    setNumbers(picked.sort((a, b) => a - b));
    setStrongNumber(Math.ceil(Math.random() * (rules.strongPoolSize ?? 7)));
  }

  function handleAddToCart() {
    if (numbers.length !== rules.pickCount || strongNumber === null) {
      Alert.alert('בחירה לא שלמה', 'בחר 6 מספרים ומספר חזק.');
      return;
    }
    addItem({
      id: nanoid(),
      gameType: 'lotto',
      numbers,
      strongNumber,
      type: 'one_time',
      price: GAME_BASE_PRICE.lotto,
      fee: SERVICE_FEE,
    });
    onAddedToCart();
  }

  const isComplete = numbers.length === rules.pickCount && strongNumber !== null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{GAME_DISPLAY_NAMES.lotto}</Text>
      <Text style={styles.instruction}>בחר 6 מספרים מ-1 עד 37</Text>

      <NumberPicker
        poolSize={rules.poolSize}
        selected={numbers}
        maxPick={rules.pickCount}
        onToggle={toggleNumber}
      />

      <Text style={[styles.instruction, { marginTop: 16 }]}>בחר מספר חזק מ-1 עד 7</Text>
      <View style={styles.strongRow}>
        {Array.from({ length: rules.strongPoolSize ?? 7 }, (_, i) => i + 1).map((n) => (
          <TouchableOpacity
            key={n}
            onPress={() => setStrongNumber(n)}
            style={[styles.strongBall, strongNumber === n && styles.strongBallSelected]}
          >
            <Text style={[styles.strongText, strongNumber === n && styles.strongTextSelected]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.selectedDisplay}>
        <Text style={styles.selectedLabel}>
          {numbers.length > 0
            ? `נבחרו: ${[...numbers].sort((a, b) => a - b).join(', ')}${strongNumber ? ` | חזק: ${strongNumber}` : ''}`
            : 'לא נבחרו מספרים'}
        </Text>
      </View>

      <TouchableOpacity style={styles.quickPickBtn} onPress={quickPick}>
        <Text style={styles.quickPickText}>מילוי אוטומטי 🎲</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.addBtn, !isComplete && styles.addBtnDisabled]}
        onPress={handleAddToCart}
        disabled={!isComplete}
      >
        <Text style={styles.addBtnText}>
          הוסף לעגלה — ₪{(GAME_BASE_PRICE.lotto + SERVICE_FEE).toFixed(1)}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#fff', flexGrow: 1 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  instruction: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 12 },
  strongRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
  strongBall: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, borderColor: '#f59e0b', alignItems: 'center', justifyContent: 'center',
  },
  strongBallSelected: { backgroundColor: '#f59e0b' },
  strongText: { fontSize: 15, fontWeight: '700', color: '#92400e' },
  strongTextSelected: { color: '#fff' },
  selectedDisplay: {
    backgroundColor: '#f9fafb', borderRadius: 8, padding: 12, marginVertical: 12,
  },
  selectedLabel: { textAlign: 'center', fontSize: 16, fontWeight: '600', color: '#374151', direction: 'ltr' },
  quickPickBtn: {
    borderWidth: 1, borderColor: '#1a56db', borderRadius: 10,
    padding: 12, alignItems: 'center', marginBottom: 12,
  },
  quickPickText: { color: '#1a56db', fontSize: 15, fontWeight: '600' },
  addBtn: { backgroundColor: '#1a56db', borderRadius: 10, padding: 16, alignItems: 'center' },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
