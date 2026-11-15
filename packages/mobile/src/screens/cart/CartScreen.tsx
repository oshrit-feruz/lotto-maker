import { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Alert,
} from 'react-native';
import { Amount, Button, EmptyState, Perforation, ScreenTitle, Stub } from '../../components/ui/index.js';
import { colors, fonts, radii, rtl, spacing, type } from '../../theme/index.js';
import { useCartStore } from '../../store/cart.store.js';
import { useAuthStore } from '../../store/auth.store.js';
import { ordersApi, walletApi } from '../../api/client.js';
import { TICKET_TYPE_LABELS } from '@lotto-maker/shared';

interface Props {
  onOrderPlaced: () => void;
}

export function CartScreen({ onOrderPlaced }: Props) {
  const { items, removeItem, clear, total } = useCartStore();
  const { user, updateUser } = useAuthStore();
  const [loading, setLoading] = useState(false);

  async function handleCheckout() {
    if (items.length === 0) return;
    const cartTotal = total();

    if (!user?.verifiedAdult) {
      Alert.alert('נדרש אימות זהות', 'השלם את אימות הגיל לפני ביצוע הזמנות.');
      return;
    }

    if (parseFloat(user.walletBalance) < cartTotal) {
      Alert.alert('יתרה לא מספיקה', `יתרתך: ₪${user.walletBalance}. נדרש: ₪${cartTotal.toFixed(2)}`);
      return;
    }

    setLoading(true);
    try {
      for (const item of items) {
        await ordersApi.create({ gameType: 'lotto', ticket: item.ticket, type: item.type });
      }
      const { balance } = await walletApi.getBalance();
      updateUser({ walletBalance: balance });
      clear();
      Alert.alert('ההזמנה בוצעה!', 'הטפסים שלך נכנסו לתור הקלדה.');
      onOrderPlaced();
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === 'QUEUE_FULL') {
        Alert.alert('התור מלא', 'הגענו לקיבולת לערב זה. נסה להזמין מוקדם יותר בפעם הבאה.');
      } else if (e.code === 'CUTOFF_PASSED') {
        Alert.alert('מאוחר מדי', 'ההגרלה הסגירה הזמנות. נסה להגרלה הבאה.');
      } else if (e.code === 'NOT_ENOUGH_DRAWS') {
        Alert.alert('מספר ההגרלות גדול מדי', 'עדיין לא פורסמו מספיק הגרלות קרובות. הקטן את מספר ההגרלות.');
      } else if (e.code === 'GAME_NOT_AVAILABLE') {
        Alert.alert('המשחק אינו זמין', 'המשחק הזה אינו זמין כרגע להזמנה.');
      } else {
        Alert.alert('שגיאה', 'ההזמנה נכשלה. נסה שנית.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <EmptyState text="העגלה ריקה" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenTitle title="העגלה" />

      <Stub>
        {items.map((item, i) => (
          <View key={item.id} style={[styles.row, i > 0 && styles.rowDivider]}>
            <Text style={styles.index}>{i + 1}</Text>
            <View style={styles.rowMain}>
              <Text style={styles.gameName}>{TICKET_TYPE_LABELS[item.ticket.type]}{item.ticket.extra ? ' + Extra' : ''}</Text>
              <Text style={styles.numbers}>
                {item.ticket.tables.length} טבלאות · {item.ticket.drawCount} הגרלות
              </Text>
            </View>
            <View style={styles.rowEnd}>
              <Text style={styles.itemPrice}>₪{(item.price + item.fee).toFixed(2)}</Text>
              <Pressable
                onPress={() => removeItem(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`הסר את טופס ${i + 1}`}
                hitSlop={6}
                style={({ pressed }) => [styles.remove, pressed && styles.removePressed]}
              >
                <Text style={styles.removeText}>הסר</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <Perforation />

        <View style={styles.summaryLine}>
          <Text style={styles.balance}>יתרת ארנק</Text>
          <Text style={styles.balance}>₪{user?.walletBalance ?? '0'}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>סה"כ לתשלום</Text>
          <Amount value={`₪${total().toFixed(2)}`} style={styles.totalValue} />
        </View>

        <Button
          label={loading ? 'מבצע הזמנה...' : 'בצע הזמנה'}
          onPress={handleCheckout}
          disabled={loading}
          variant="accent"
          size="lg"
          block
          style={styles.checkout}
        />
      </Stub>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.paper, flexGrow: 1, paddingBottom: spacing.xxxl },
  emptyWrap: { flex: 1, padding: spacing.lg, backgroundColor: colors.paper, justifyContent: 'center' },
  row: { flexDirection: rtl.row, alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.line },
  index: { fontFamily: fonts.display, fontSize: 18, color: colors.muted, minWidth: 18, textAlign: 'center' },
  rowMain: { flex: 1 },
  rowEnd: { alignItems: rtl.alignEnd, gap: 2 },
  gameName: { fontFamily: fonts.display, fontSize: 18, lineHeight: 23, color: colors.pineDeep, textAlign: rtl.textStart },
  numbers: { ...type.small, textAlign: rtl.textStart },
  itemPrice: { ...type.bodyStrong, fontVariant: ['tabular-nums'] },
  remove: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center', borderRadius: radii.pill },
  removePressed: { backgroundColor: colors.dangerSoft },
  removeText: { fontFamily: fonts.bodyBold, color: colors.danger, fontSize: 14, textDecorationLine: 'underline' },
  summaryLine: { flexDirection: rtl.row, justifyContent: 'space-between', marginBottom: 4 },
  balance: { ...type.small },
  totalRow: { flexDirection: rtl.row, justifyContent: 'space-between', alignItems: 'baseline' },
  totalLabel: { ...type.bodyStrong },
  totalValue: { fontSize: 34, lineHeight: 40 },
  checkout: { marginTop: spacing.lg },
});
