import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Switch, ActivityIndicator,
} from 'react-native';
import {
  GAME_DISPLAY_NAMES,
  LOTTO_NUMBER_MAX,
  LOTTO_PICK_COUNT,
  LOTTO_STRONG_MAX,
  MAX_DRAW_COUNT,
  TICKET_TYPE_LABELS,
  TICKET_TYPE_LIMITS,
  validateTicket,
} from '@lotto-maker/shared';
import type { TicketType } from '@lotto-maker/shared';
import { NumberPicker } from '../../components/NumberPicker/NumberPicker.js';
import { useCartStore } from '../../store/cart.store.js';
import { ticketsApi } from '../../api/client.js';
import type { TicketPayload, TicketPrice } from '../../api/client.js';
import { nanoid } from 'nanoid/non-secure';

interface Props {
  onAddedToCart: () => void;
}

interface TableState {
  numbers: number[];
  strong: number | null;
}

const emptyTable = (): TableState => ({ numbers: [], strong: null });
const isComplete = (t: TableState) => t.numbers.length === LOTTO_PICK_COUNT && t.strong !== null;

function resize(tables: TableState[], count: number): TableState[] {
  return Array.from({ length: count }, (_, i) => tables[i] ?? emptyTable());
}

// Systematic forms are not offered in the app yet: their rules are unverified (see packages/shared).
export function LottoFormScreen({ onAddedToCart }: Props) {
  const addItem = useCartStore((s) => s.addItem);

  const [type, setType] = useState<TicketType>('regular');
  const [tables, setTables] = useState<TableState[]>(() => resize([], 2));
  const [active, setActive] = useState(0);
  const [extra, setExtra] = useState(false);
  const [drawCount, setDrawCount] = useState(1);

  const [price, setPrice] = useState<TicketPrice | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [pricing, setPricing] = useState(false);
  const [duplicateDraws, setDuplicateDraws] = useState<number[]>([]);
  const [lottomatBusy, setLottomatBusy] = useState(false);

  const limits = TICKET_TYPE_LIMITS[type];
  const allComplete = tables.every(isComplete);

  const payload: TicketPayload | null = useMemo(() => {
    if (!allComplete) return null;
    const p: TicketPayload = {
      type,
      systematicType: null,
      extra,
      drawCount,
      tables: tables.map((t) => ({ numbers: [...t.numbers].sort((a, b) => a - b), strongNumbers: [t.strong as number] })),
    };
    // Same rules as the server (shared package); the server stays the authority
    return validateTicket(p).length === 0 ? p : null;
  }, [allComplete, type, extra, drawCount, tables]);

  // Live price and duplicate warning, debounced while the user edits
  useEffect(() => {
    setPrice(null);
    setPriceError(null);
    setDuplicateDraws([]);
    if (!payload) return;
    let cancelled = false;
    setPricing(true);
    const timer = setTimeout(() => {
      ticketsApi.calculate(payload)
        .then((p) => { if (!cancelled) setPrice(p); })
        .catch((err: { code?: string }) => {
          if (cancelled) return;
          setPriceError(
            err.code === 'EXTRA_NOT_AVAILABLE' ? 'Extra אינו זמין כרגע.' : 'לא ניתן לחשב מחיר כרגע.',
          );
        })
        .finally(() => { if (!cancelled) setPricing(false); });
      ticketsApi.checkDuplicate(payload)
        .then((d) => { if (!cancelled) setDuplicateDraws(d.duplicate ? d.drawNumbers : []); })
        .catch(() => { /* a missing warning is harmless */ });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); setPricing(false); };
  }, [payload]);

  function changeType(next: TicketType) {
    setType(next);
    const max = TICKET_TYPE_LIMITS[next].maxTables;
    if (tables.length > max) {
      setTables((prev) => resize(prev, max));
      setActive(0);
    }
  }

  function changeTableCount(delta: number) {
    const next = tables.length + delta * 2;
    if (next < limits.minTables || next > limits.maxTables) return;
    setTables((prev) => resize(prev, next));
    setActive((a) => Math.min(a, next - 1));
  }

  function toggleNumber(n: number) {
    setTables((prev) => prev.map((t, i) => {
      if (i !== active) return t;
      const has = t.numbers.includes(n);
      if (!has && t.numbers.length >= LOTTO_PICK_COUNT) return t;
      return { ...t, numbers: has ? t.numbers.filter((x) => x !== n) : [...t.numbers, n] };
    }));
  }

  function setStrong(n: number) {
    setTables((prev) => prev.map((t, i) => (i === active ? { ...t, strong: n } : t)));
  }

  // Lottomat: the server generates the tables
  async function lottomat() {
    setLottomatBusy(true);
    try {
      const { tables: generated } = await ticketsApi.lottomat(type, tables.length);
      setTables(generated.map((t) => ({ numbers: t.numbers, strong: t.strongNumbers[0] ?? null })));
    } catch {
      Alert.alert('שגיאה', 'לא ניתן להגריל מספרים כרגע.');
    } finally {
      setLottomatBusy(false);
    }
  }

  function handleAddToCart() {
    if (!payload || !price) return;
    if (!price.enoughDraws) {
      Alert.alert('אין מספיק הגרלות', 'עדיין לא פורסמו מספיק הגרלות קרובות. הקטן את מספר ההגרלות.');
      return;
    }
    addItem({
      id: nanoid(),
      ticket: payload,
      type: 'one_time',
      price: (Number(price.perOrder.paisPrice) + Number(price.perOrder.extraPrice)) * payload.drawCount,
      fee: Number(price.perOrder.fee) * payload.drawCount,
    });
    onAddedToCart();
  }

  const current = tables[active] ?? emptyTable();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{GAME_DISPLAY_NAMES.lotto}</Text>

      <View style={styles.segment}>
        {(['regular', 'double'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.segmentBtn, type === t && styles.segmentBtnOn]}
            onPress={() => changeType(t)}
          >
            <Text style={[styles.segmentText, type === t && styles.segmentTextOn]}>{TICKET_TYPE_LABELS[t]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Stepper
        label="מספר טבלאות (זוגי)"
        value={tables.length}
        onMinus={() => changeTableCount(-1)}
        onPlus={() => changeTableCount(1)}
        minusDisabled={tables.length <= limits.minTables}
        plusDisabled={tables.length >= limits.maxTables}
      />
      <Stepper
        label="מספר הגרלות"
        value={drawCount}
        onMinus={() => setDrawCount((d) => Math.max(1, d - 1))}
        onPlus={() => setDrawCount((d) => Math.min(MAX_DRAW_COUNT, d + 1))}
        minusDisabled={drawCount <= 1}
        plusDisabled={drawCount >= MAX_DRAW_COUNT}
      />

      <View style={styles.extraRow}>
        <Text style={styles.extraLabel}>Extra</Text>
        <Switch value={extra} onValueChange={setExtra} />
      </View>

      <TouchableOpacity style={styles.lottomatBtn} onPress={lottomat} disabled={lottomatBusy}>
        <Text style={styles.lottomatText}>{lottomatBusy ? 'מגריל...' : 'לוטומט — הגרל את כל הטבלאות 🎲'}</Text>
      </TouchableOpacity>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {tables.map((t, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.chip, active === i && styles.chipActive]}
            onPress={() => setActive(i)}
          >
            <Text style={[styles.chipText, active === i && styles.chipTextActive]}>
              {i + 1}{isComplete(t) ? ' ✓' : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.instruction}>טבלה {active + 1}: בחר {LOTTO_PICK_COUNT} מספרים מ-1 עד {LOTTO_NUMBER_MAX}</Text>
      <NumberPicker
        poolSize={LOTTO_NUMBER_MAX}
        selected={current.numbers}
        maxPick={LOTTO_PICK_COUNT}
        onToggle={toggleNumber}
      />

      <Text style={[styles.instruction, { marginTop: 16 }]}>מספר חזק מ-1 עד {LOTTO_STRONG_MAX}</Text>
      <View style={styles.strongRow}>
        {Array.from({ length: LOTTO_STRONG_MAX }, (_, i) => i + 1).map((n) => (
          <TouchableOpacity
            key={n}
            onPress={() => setStrong(n)}
            style={[styles.strongBall, current.strong === n && styles.strongBallSelected]}
          >
            <Text style={[styles.strongText, current.strong === n && styles.strongTextSelected]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {duplicateDraws.length > 0 && (
        <View style={styles.warning}>
          <Text style={styles.warningText}>
            שים לב: כבר הזמנת את אותם מספרים בהגרלה {duplicateDraws.join(', ')}. אפשר להמשיך.
          </Text>
        </View>
      )}

      <View style={styles.priceBox}>
        {pricing && <ActivityIndicator color="#1a56db" />}
        {!pricing && price && (
          <>
            <PriceLine label="מחיר פיס" value={(Number(price.perOrder.paisPrice) + Number(price.perOrder.extraPrice)) * drawCount} />
            <PriceLine label="עמלת שירות" value={Number(price.perOrder.fee) * drawCount} />
            <PriceLine label={`סה"כ (${drawCount} הגרלות)`} value={Number(price.total)} bold />
            {!price.enoughDraws && (
              <Text style={styles.warningText}>פורסמו רק {price.draws.length} הגרלות קרובות.</Text>
            )}
          </>
        )}
        {!pricing && !price && !priceError && (
          <Text style={styles.priceHint}>{allComplete ? 'מחשב מחיר...' : 'השלם את כל הטבלאות כדי לראות מחיר'}</Text>
        )}
        {priceError && <Text style={styles.errorText}>{priceError}</Text>}
      </View>

      <TouchableOpacity
        style={[styles.addBtn, !(price && payload && price.enoughDraws) && styles.addBtnDisabled]}
        onPress={handleAddToCart}
        disabled={!(price && payload && price.enoughDraws)}
      >
        <Text style={styles.addBtnText}>
          {price ? `הוסף לעגלה — ₪${Number(price.total).toFixed(2)}` : 'הוסף לעגלה'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Stepper(props: {
  label: string; value: number; onMinus: () => void; onPlus: () => void;
  minusDisabled: boolean; plusDisabled: boolean;
}) {
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{props.label}</Text>
      <View style={styles.stepper}>
        <TouchableOpacity onPress={props.onMinus} disabled={props.minusDisabled} style={[styles.stepBtn, props.minusDisabled && styles.addBtnDisabled]}>
          <Text style={styles.stepBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.stepValue}>{props.value}</Text>
        <TouchableOpacity onPress={props.onPlus} disabled={props.plusDisabled} style={[styles.stepBtn, props.plusDisabled && styles.addBtnDisabled]}>
          <Text style={styles.stepBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PriceLine({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <View style={styles.priceLine}>
      <Text style={[styles.priceText, bold && styles.priceBold]}>{label}</Text>
      <Text style={[styles.priceText, bold && styles.priceBold]}>₪{value.toFixed(2)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#fff', flexGrow: 1 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  instruction: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 12 },
  segment: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, borderColor: '#1a56db', overflow: 'hidden', marginBottom: 12 },
  segmentBtn: { flex: 1, padding: 12, alignItems: 'center' },
  segmentBtnOn: { backgroundColor: '#1a56db' },
  segmentText: { color: '#1a56db', fontWeight: '600' },
  segmentTextOn: { color: '#fff' },
  stepperRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  stepperLabel: { fontSize: 15, color: '#374151' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#1a56db', alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 20, color: '#1a56db', fontWeight: '700' },
  stepValue: { fontSize: 18, fontWeight: '700', minWidth: 24, textAlign: 'center' },
  extraRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  extraLabel: { fontSize: 15, color: '#374151' },
  lottomatBtn: { borderWidth: 1, borderColor: '#1a56db', borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 12 },
  lottomatText: { color: '#1a56db', fontSize: 15, fontWeight: '600' },
  chips: { gap: 8, paddingVertical: 8 },
  chip: { minWidth: 44, paddingHorizontal: 10, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  chipText: { color: '#374151', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  strongRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
  strongBall: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#f59e0b', alignItems: 'center', justifyContent: 'center' },
  strongBallSelected: { backgroundColor: '#f59e0b' },
  strongText: { fontSize: 15, fontWeight: '700', color: '#92400e' },
  strongTextSelected: { color: '#fff' },
  warning: { backgroundColor: '#fef3c7', borderRadius: 8, padding: 12, marginBottom: 12 },
  warningText: { color: '#92400e', textAlign: 'right' },
  errorText: { color: '#e02424', textAlign: 'right' },
  priceBox: { backgroundColor: '#f9fafb', borderRadius: 8, padding: 12, marginBottom: 12, minHeight: 56, justifyContent: 'center' },
  priceHint: { color: '#9ca3af', textAlign: 'center' },
  priceLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  priceText: { fontSize: 15, color: '#374151' },
  priceBold: { fontWeight: '700', fontSize: 17 },
  addBtn: { backgroundColor: '#1a56db', borderRadius: 10, padding: 16, alignItems: 'center' },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
