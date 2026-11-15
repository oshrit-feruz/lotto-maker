import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, Pressable, RefreshControl,
} from 'react-native';
import { Amount, BallFace, EmptyState, LoadError, Loading } from '../../components/ui/index.js';
import { colors, fonts, radii, rtl, spacing, type } from '../../theme/index.js';
import { walletApi } from '../../api/client.js';
import { openCheckout, waitForPayment, useOnForeground, depositErrorMessage } from '../../api/checkout.js';
import { useAuthStore } from '../../store/auth.store.js';
import { formatTxAmount, txDirection } from '../../lib/money.js';
import { notify } from '../../lib/confirm.js';

const PRESET_AMOUNTS = [20, 50, 100, 200];

interface TxRow {
  id: string;
  type: string;
  amount: string;
  description: string;
  createdAt: string;
}

const TX_COLORS: Record<string, string> = {
  deposit: colors.ok,
  winning: colors.plum,
  charge: colors.danger,
  refund: colors.muted,
};

export function WalletScreen() {
  const { user, updateUser } = useAuthStore();
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState(false);
  const pendingPayment = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [balRes, txRes] = await Promise.all([
        walletApi.getBalance(),
        walletApi.getTransactions(),
      ]);
      updateUser({ walletBalance: balRes.balance });
      setTxs(txRes.data as TxRow[]);
      setError(false);
    } catch {
      setError(true);
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
      notify('שגיאה', depositErrorMessage(err));
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
        notify('הופקד בהצלחה', 'הסכום נוסף לארנק שלך');
      } else if (status === 'pending') {
        notify('התשלום בבדיקה', 'היתרה תתעדכן מיד כשהתשלום יאושר.');
      } else {
        notify('התשלום לא בוצע', 'לא חויבת. אפשר לנסות שנית.');
      }
    } catch {
      notify('שגיאה', 'לא הצלחנו לבדוק את מצב התשלום. נסה שנית.');
    } finally {
      setPaying(false);
    }
  });

  function retry() {
    setLoading(true);
    load();
  }

  if (loading) return <Loading />;

  return (
    <FlatList
      data={txs}
      keyExtractor={(t) => t.id}
      style={styles.screen}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.pine} colors={[colors.pine]} onRefresh={() => { setRefreshing(true); load(); }} />}
      ListHeaderComponent={() => (
        <View>
          {error && <LoadError message="לא הצלחנו לטעון את הארנק." onRetry={retry} />}
          <View style={styles.balanceCard}>
            <View style={styles.balanceDeco} pointerEvents="none">
              <BallFace size={110} tone="sun" />
            </View>
            <Text style={styles.balanceLabel}>יתרת ארנק</Text>
            <Amount value={`₪${user?.walletBalance ?? '0.00'}`} style={styles.balance} />
          </View>

          <Text style={styles.sectionTitle}>טען ארנק</Text>
          <View style={styles.presetRow}>
            {PRESET_AMOUNTS.map((amt) => (
              <Pressable
                key={amt}
                style={({ pressed }) => [styles.presetBtn, paying && styles.presetDisabled, pressed && !paying && styles.presetPressed]}
                disabled={paying}
                onPress={() => handleDeposit(amt)}
                accessibilityRole="button"
                accessibilityLabel={`טען ${amt} שקלים`}
                accessibilityState={{ disabled: paying }}
              >
                <Amount value={`₪${amt}`} style={styles.presetText} />
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionTitle}>היסטוריית עסקאות</Text>
        </View>
      )}
      ListEmptyComponent={error ? null : <EmptyState text="אין עסקאות עדיין" />}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        const direction = txDirection(item.type, item.amount);
        const color = TX_COLORS[item.type] ?? (direction === 'debit' ? colors.danger : colors.ink);
        return (
          <View style={styles.txRow}>
            <View style={styles.txMain}>
              <Text style={styles.txDesc}>{item.description}</Text>
              <Text style={styles.txDate}>{new Date(item.createdAt).toLocaleDateString('he-IL')}</Text>
            </View>
            <Text style={[styles.txAmount, { color }]}>
              {formatTxAmount(item.type, item.amount)}
            </Text>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.paper },
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  balanceCard: {
    backgroundColor: colors.pine, borderRadius: radii.lg, paddingVertical: 26, paddingHorizontal: 22,
    marginBottom: spacing.xl, overflow: 'hidden',
  },
  balanceDeco: { position: 'absolute', top: -34, [rtl.physicalLeft]: -30 },
  balanceLabel: { ...type.label, color: colors.onPineMuted, textAlign: rtl.textStart },
  balance: { color: colors.brandInk, fontSize: 44, lineHeight: 52, textAlign: rtl.textStart },
  sectionTitle: { ...type.h3, textAlign: rtl.textStart, marginBottom: 10 },
  presetRow: { flexDirection: rtl.row, gap: 8, marginBottom: spacing.xl },
  presetBtn: {
    flex: 1, minHeight: 52, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.sun, borderBottomWidth: 3, borderBottomColor: colors.sunDeep,
  },
  presetPressed: { backgroundColor: colors.sunHover, transform: [{ translateY: 1 }] },
  presetDisabled: { backgroundColor: colors.disabledBg, borderBottomWidth: 0 },
  presetText: { fontSize: 20, lineHeight: 24, color: colors.pineDeep },
  txRow: {
    flexDirection: rtl.row, justifyContent: 'space-between', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8,
    backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.line,
  },
  txMain: { flex: 1 },
  txDesc: { ...type.body, fontSize: 15, lineHeight: 21, textAlign: rtl.textStart },
  txDate: { ...type.caption, marginTop: 2, textAlign: rtl.textStart },
  txAmount: { fontFamily: fonts.bodyBold, fontSize: 16, fontVariant: ['tabular-nums'] },
});
