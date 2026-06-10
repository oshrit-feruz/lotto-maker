import { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { useCartStore } from '../../store/cart.store.js';
import { useAuthStore } from '../../store/auth.store.js';
import { ordersApi, walletApi } from '../../api/client.js';
import { GAME_DISPLAY_NAMES } from '@lotto-maker/shared';

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
        await ordersApi.create({
          gameType: item.gameType,
          numbers: item.numbers,
          strongNumber: item.strongNumber,
          type: item.type,
        });
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
      } else {
        Alert.alert('שגיאה', 'ההזמנה נכשלה. נסה שנית.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>העגלה ריקה</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.gameName}>{GAME_DISPLAY_NAMES[item.gameType]}</Text>
              <Text style={styles.numbers}>{item.numbers.join(', ')}{item.strongNumber ? ` | ${item.strongNumber}` : ''}</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.itemPrice}>₪{(item.price + item.fee).toFixed(1)}</Text>
              <TouchableOpacity onPress={() => removeItem(item.id)}>
                <Text style={styles.remove}>הסר</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListFooterComponent={() => (
          <View style={styles.summary}>
            <Text style={styles.balance}>יתרת ארנק: ₪{user?.walletBalance ?? '0'}</Text>
            <Text style={styles.totalLabel}>סה"כ לתשלום: ₪{total().toFixed(2)}</Text>
          </View>
        )}
      />

      <TouchableOpacity
        style={[styles.checkoutBtn, loading && styles.checkoutBtnDisabled]}
        onPress={handleCheckout}
        disabled={loading}
      >
        <Text style={styles.checkoutText}>{loading ? 'מבצע הזמנה...' : 'בצע הזמנה'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#9ca3af', fontSize: 18 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderColor: '#f3f4f6',
  },
  rowLeft: { flex: 1 },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  gameName: { fontSize: 16, fontWeight: '700', color: '#1a56db' },
  numbers: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  itemPrice: { fontSize: 16, fontWeight: '700' },
  remove: { color: '#e02424', fontSize: 13 },
  summary: { padding: 16, backgroundColor: '#f9fafb', margin: 12, borderRadius: 10 },
  balance: { fontSize: 14, color: '#6b7280', textAlign: 'right', marginBottom: 4 },
  totalLabel: { fontSize: 18, fontWeight: '700', textAlign: 'right' },
  checkoutBtn: {
    backgroundColor: '#1a56db', margin: 16, borderRadius: 10,
    padding: 18, alignItems: 'center',
  },
  checkoutBtnDisabled: { opacity: 0.5 },
  checkoutText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
