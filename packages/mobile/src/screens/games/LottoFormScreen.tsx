import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Alert, Switch, ActivityIndicator,
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
import {
  Amount, BallFace, Button, Card, Notice, Perforation, ScreenTitle, Segmented, Stub,
} from '../../components/ui/index.js';
import { colors, fonts, radii, rtl, spacing, type as typo } from '../../theme/index.js';
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
  const canAdd = !!(price && payload && price.enoughDraws);

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <ScreenTitle title={GAME_DISPLAY_NAMES.lotto} />

      <Card>
        <Segmented
          options={(['regular', 'double'] as const).map((t) => ({ value: t, label: TICKET_TYPE_LABELS[t] }))}
          value={type}
          onChange={changeType}
          style={styles.segment}
        />

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
          <Text style={styles.rowLabel}>Extra</Text>
          <Switch
            value={extra}
            onValueChange={setExtra}
            trackColor={{ false: colors.line, true: colors.pine }}
            thumbColor={extra ? colors.sun : colors.surface}
            accessibilityLabel="Extra"
          />
        </View>

        <Button
          label={lottomatBusy ? 'מגריל...' : 'לוטומט — הגרל את כל הטבלאות'}
          onPress={lottomat}
          disabled={lottomatBusy}
          variant="ghost"
          block
          icon={<LottomatIcon />}
        />
      </Card>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipsScroll}
      >
        {tables.map((t, i) => {
          const on = active === i;
          const done = isComplete(t);
          return (
            <Pressable
              key={i}
              style={[styles.chip, done && styles.chipDone, on && styles.chipActive]}
              onPress={() => setActive(i)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`טבלה ${i + 1}${done ? ', מלאה' : ''}`}
            >
              <Text style={[styles.chipText, on && styles.chipTextActive]}>{i + 1}</Text>
              {done && (
                <View style={[styles.chipDot, on && styles.chipDotActive]}>
                  <Text style={[styles.chipDotText, on && styles.chipDotTextActive]}>✓</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.tableCard, isComplete(current) && styles.tableCardDone]}>
        <View style={styles.pickerLabel}>
          <Text style={styles.tableTitle}>טבלה {active + 1}</Text>
          <Text style={styles.pickerCount}>{current.numbers.length}/{LOTTO_PICK_COUNT}</Text>
        </View>
        <Text style={styles.instruction}>בחר {LOTTO_PICK_COUNT} מספרים מ-1 עד {LOTTO_NUMBER_MAX}</Text>
        <NumberPicker
          poolSize={LOTTO_NUMBER_MAX}
          selected={current.numbers}
          maxPick={LOTTO_PICK_COUNT}
          onToggle={toggleNumber}
        />

        <View style={[styles.pickerLabel, styles.strongLabel]}>
          <Text style={styles.strongTitle}>מספר חזק מ-1 עד {LOTTO_STRONG_MAX}</Text>
          <Text style={[styles.pickerCount, { color: colors.plum }]}>{current.strong !== null ? 1 : 0}/1</Text>
        </View>
        <NumberPicker
          poolSize={LOTTO_STRONG_MAX}
          selected={current.strong !== null ? [current.strong] : []}
          maxPick={LOTTO_STRONG_MAX}
          onToggle={setStrong}
          strong
        />
      </View>

      {duplicateDraws.length > 0 && (
        <Notice tone="warn">
          {`שים לב: כבר הזמנת את אותם מספרים בהגרלה ${duplicateDraws.join(', ')}. אפשר להמשיך.`}
        </Notice>
      )}

      <Stub>
        {pricing && <ActivityIndicator color={colors.pine} style={{ marginVertical: 8 }} />}
        {!pricing && price && (
          <>
            <PriceLine label="מחיר פיס" value={(Number(price.perOrder.paisPrice) + Number(price.perOrder.extraPrice)) * drawCount} />
            <PriceLine label="עמלת שירות" value={Number(price.perOrder.fee) * drawCount} />
            <Perforation />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{`סה"כ (${drawCount} הגרלות)`}</Text>
              <Amount value={`₪${Number(price.total).toFixed(2)}`} style={styles.totalValue} />
            </View>
            {!price.enoughDraws && (
              <Text style={styles.warningText}>פורסמו רק {price.draws.length} הגרלות קרובות.</Text>
            )}
          </>
        )}
        {!pricing && !price && !priceError && (
          <Text style={styles.priceHint}>{allComplete ? 'מחשב מחיר...' : 'השלם את כל הטבלאות כדי לראות מחיר'}</Text>
        )}
        {priceError && <Text style={styles.errorText}>{priceError}</Text>}

        <Button
          label={price ? `הוסף לעגלה — ₪${Number(price.total).toFixed(2)}` : 'הוסף לעגלה'}
          onPress={handleAddToCart}
          disabled={!canAdd}
          variant="accent"
          size="lg"
          block
          style={styles.addBtn}
        />
      </Stub>
    </ScrollView>
  );
}

/** Two small balls, sun and plum: the lottomat (random pick) mark. */
function LottomatIcon() {
  return (
    <View style={styles.lottomatIcon}>
      <BallFace size={14} tone="sun" />
      <BallFace size={14} tone="plum" />
    </View>
  );
}

function Stepper(props: {
  label: string; value: number; onMinus: () => void; onPlus: () => void;
  minusDisabled: boolean; plusDisabled: boolean;
}) {
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.rowLabel}>{props.label}</Text>
      <View style={styles.stepper}>
        <StepButton glyph="+" label={`הוסף: ${props.label}`} onPress={props.onPlus} disabled={props.plusDisabled} />
        <Text style={styles.stepValue}>{props.value}</Text>
        <StepButton glyph="−" label={`הפחת: ${props.label}`} onPress={props.onMinus} disabled={props.minusDisabled} />
      </View>
    </View>
  );
}

function StepButton({ glyph, label, onPress, disabled }: { glyph: string; label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.stepBtn, disabled && styles.stepBtnDisabled, pressed && !disabled && styles.stepBtnPressed]}
    >
      <Text style={[styles.stepBtnText, disabled && { color: colors.faint }]}>{glyph}</Text>
    </Pressable>
  );
}

function PriceLine({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.priceLine}>
      <Text style={styles.priceText}>{label}</Text>
      <Text style={[styles.priceText, styles.priceNum]}>₪{value.toFixed(2)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.paper, flexGrow: 1, paddingBottom: spacing.xxxl },
  segment: { marginBottom: spacing.md },
  rowLabel: { ...typo.label, textAlign: rtl.textStart, flexShrink: 1 },
  stepperRow: {
    flexDirection: rtl.row, justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  stepper: { flexDirection: rtl.row, alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
  },
  stepBtnPressed: { backgroundColor: colors.brandSoft },
  stepBtnDisabled: { opacity: 0.55 },
  stepBtnText: { fontFamily: fonts.bodyBold, fontSize: 22, lineHeight: 26, color: colors.pine },
  stepValue: { fontFamily: fonts.display, fontSize: 22, minWidth: 28, textAlign: 'center', color: colors.pineDeep },
  extraRow: {
    flexDirection: rtl.row, justifyContent: 'space-between', alignItems: 'center',
    minHeight: 56, marginBottom: spacing.md,
  },
  lottomatIcon: { flexDirection: 'row', gap: 2 },

  chipsScroll: { flexGrow: 0, marginBottom: spacing.sm },
  chips: { flexDirection: rtl.row, gap: 8, paddingVertical: 4, flexGrow: 1 },
  chip: {
    minWidth: 48, minHeight: 44, paddingHorizontal: 12, borderRadius: radii.pill,
    borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface,
    flexDirection: rtl.row, alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  chipDone: { borderColor: colors.pine2 },
  chipActive: { backgroundColor: colors.pine, borderColor: colors.pine },
  chipText: { fontFamily: fonts.display, fontSize: 18, color: colors.pine },
  chipTextActive: { color: colors.brandInk },
  chipDot: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: colors.pine,
    alignItems: 'center', justifyContent: 'center',
  },
  chipDotActive: { backgroundColor: colors.sun },
  chipDotText: { color: colors.sun, fontSize: 11, fontFamily: fonts.bodyBold },
  chipDotTextActive: { color: colors.pineDeep },

  tableCard: {
    borderWidth: 1.5, borderColor: colors.line, borderRadius: radii.md,
    paddingTop: 12, paddingHorizontal: 10, paddingBottom: 16,
    backgroundColor: colors.surface, marginBottom: spacing.lg,
  },
  tableCardDone: { borderColor: colors.pine2 },
  pickerLabel: { flexDirection: rtl.row, justifyContent: 'space-between', alignItems: 'baseline' },
  strongLabel: { marginTop: 18, marginBottom: 8 },
  tableTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.pineDeep },
  strongTitle: { ...typo.label, color: colors.plum, fontFamily: fonts.bodyBold },
  pickerCount: { fontFamily: fonts.display, fontSize: 16, color: colors.pine2 },
  instruction: { ...typo.small, textAlign: rtl.textStart, marginBottom: 10 },

  warningText: { ...typo.small, color: colors.warnInk, textAlign: rtl.textStart, marginTop: 6 },
  errorText: { ...typo.small, color: colors.danger, textAlign: rtl.textStart, fontFamily: fonts.bodyBold },
  priceHint: { ...typo.small, textAlign: 'center', paddingVertical: 6 },
  priceLine: { flexDirection: rtl.row, justifyContent: 'space-between', paddingVertical: 3 },
  priceText: { ...typo.body, fontSize: 15 },
  priceNum: { fontVariant: ['tabular-nums'] },
  totalRow: { flexDirection: rtl.row, justifyContent: 'space-between', alignItems: 'baseline' },
  totalLabel: { ...typo.bodyStrong },
  totalValue: { fontSize: 32, lineHeight: 38 },
  addBtn: { marginTop: spacing.lg },
});
