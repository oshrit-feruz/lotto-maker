import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { walletApi } from '../../api/client.js';
import { openCheckout, waitForPayment, useOnForeground, depositErrorMessage } from '../../api/checkout.js';
import { useAuthStore } from '../../store/auth.store.js';

const PRESET_AMOUNTS = [20, 50, 100, 200];

interface TxRow {
  id: string;
  type: string;
  amount: string;
  description: string;
  createdAt: string;
}

const TX_COLORS: Record<string, string> = {
  deposit: '#057a55',
  winning: '#d97706',
  charge: '#e02424',
  refund: '#6b7280',
};

export function WalletScreen() {
  const { user, updateUser } = useAuthStore();
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paying, setPaying] = useState(false);
  const pendingPayment = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [balRes, txRes] = await Promise.all([
        walletApi.getBalance(),
        walletApi.getTransactions(),
      ]);
      updateUser({ walletBalance: balRes.balance });
      setTxs(txRes.data as TxRow[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [updateUser]);

  useEffect(() => { load(); }, [load]);

  // No money is added here: we open the provider's checkout page and the
  // server credits the wallet once the provider confirms the payment.
  async function handleDeposit(amount: number) {
    if (paying) return;
    setPaying(true);
    try {
      pendingPayment.current = await openCheckout(amount);
    } catch (err: unknown) {
      setPaying(false);
      Alert.alert('שגיאה', depositErrorMessage(err));
    }
  }

  // Back from the checkout page: see how the payment ended, then reload.
  useOnForeground(async () => {
    const paymentId = pendingPayment.current;
    if (!paymentId) return;
    pendingPayment.current = null;
    try {
      const status = await waitForPayment(paymentId);
      await load();
      if (status === 'approved') {
        Alert.alert('הופקד בהצלחה', 'הסכום נוסף לארנק שלך');
      } else if (status === 'pending') {
        Alert.alert('התשלום בבדיקה', 'היתרה תתעדכן מיד כשהתשלום יאושר.');
      } else {
        Alert.alert('התשלום לא בוצע', 'לא חויבת. אפשר לנסות שנית.');
      }
    } catch {
      Alert.alert('שגיאה', 'לא הצלחנו לבדוק את מצב התשלום. נסה שנית.');
    } finally {
      setPaying(false);
    }
  });

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#1a56db" />;

  return (
    <FlatList
      data={txs}
      keyExtractor={(t) => t.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      ListHeaderComponent={() => (
        <View>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>יתרת ארנק</Text>
            <Text style={styles.balance}>₪{user?.walletBalance ?? '0.00'}</Text>
          </View>
          <Text style={styles.sectionTitle}>טען ארנק</Text>
          <View style={styles.presetRow}>
            {PRESET_AMOUNTS.map((amt) => (
              <TouchableOpacity key={amt} style={[styles.presetBtn, paying && { opacity: 0.5 }]} disabled={paying} onPress={() => handleDeposit(amt)}>
                <Text style={styles.presetText}>₪{amt}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.sectionTitle}>היסטוריית עסקאות</Text>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>אין עסקאות עדיין</Text>}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        const isCredit = item.type === 'deposit' || item.type === 'winning' || item.type === 'refund';
        return (
          <View style={styles.txRow}>
            <View>
              <Text style={styles.txDesc}>{item.description}</Text>
              <Text style={styles.txDate}>{new Date(item.createdAt).toLocaleDateString('he-IL')}</Text>
            </View>
            <Text style={[styles.txAmount, { color: TX_COLORS[item.type] ?? '#374151' }]}>
              {isCredit ? '+' : '-'}₪{item.amount}
            </Text>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12 },
  balanceCard: {
    backgroundColor: '#1a56db', borderRadius: 14, padding: 24,
    alignItems: 'center', marginBottom: 16,
  },
  balanceLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 4 },
  balance: { color: '#fff', fontSize: 36, fontWeight: '700' },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#6b7280', marginBottom: 8, marginTop: 4 },
  presetRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  presetBtn: {
    flex: 1, padding: 12, backgroundColor: '#eff6ff',
    borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#bfdbfe',
  },
  presetText: { fontSize: 16, fontWeight: '700', color: '#1a56db' },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 30 },
  txRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f3f4f6',
  },
  txDesc: { fontSize: 14, fontWeight: '600', color: '#374151' },
  txDate: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  txAmount: { fontSize: 16, fontWeight: '700' },
});
