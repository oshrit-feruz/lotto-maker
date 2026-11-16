import { useRef, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Amount, AuthLayout, Button } from '../../components/ui/index.js';
import { colors, radii, rtl } from '../../theme/index.js';
import { walletApi } from '../../api/client.js';
import { openCheckout, waitForPayment, useOnForeground, depositErrorMessage } from '../../api/checkout.js';
import { useAuthStore } from '../../store/auth.store.js';
import { notify } from '../../lib/confirm.js';

const PRESET_AMOUNTS = [20, 50, 100, 200];

interface Props {
  onContinue: () => void;
}

export function WalletLoadScreen({ onContinue }: Readonly<Props>) {
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const pendingPayment = useRef<string | null>(null);
  const updateUser = useAuthStore((s) => s.updateUser);

  // No money is added here: we open the provider's checkout page and the
  // server credits the wallet once the provider confirms the payment.
  async function handleDeposit() {
    if (!selected || loading) return;
    setLoading(true);
    try {
      pendingPayment.current = await openCheckout(selected);
    } catch (err: unknown) {
      setLoading(false);
      notify('שגיאה', depositErrorMessage(err));
    }
  }

  // Back from the checkout page: see how the payment ended.
  useOnForeground(async () => {
    const paymentId = pendingPayment.current;
    if (!paymentId) return;
    pendingPayment.current = null;
    try {
      const status = await waitForPayment(paymentId);
      if (status === 'approved') {
        const { balance } = await walletApi.getBalance();
        updateUser({ walletBalance: balance });
        onContinue();
      } else if (status === 'pending') {
        notify('התשלום בבדיקה', 'היתרה תתעדכן מיד כשהתשלום יאושר.', { okText: 'המשך', onDismiss: onContinue });
      } else {
        notify('התשלום לא בוצע', 'לא חויבת. אפשר לנסות שנית.');
      }
    } catch {
      notify('שגיאה', 'לא הצלחנו לבדוק את מצב התשלום. נסה שנית.');
    } finally {
      setLoading(false);
    }
  });

  return (
    <AuthLayout title="טען את הארנק" subtitle="בחר סכום לטעינה ראשונית">
      <View style={styles.grid} accessibilityRole="radiogroup">
        {PRESET_AMOUNTS.map((amt) => {
          const on = selected === amt;
          return (
            <Pressable
              key={amt}
              onPress={() => setSelected(amt)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={({ pressed }) => [styles.amtBtn, on && styles.amtBtnSelected, pressed && !on && styles.amtBtnPressed]}
            >
              <Amount value={`₪${amt}`} style={[styles.amtText, on && styles.amtTextSelected]} />
            </Pressable>
          );
        })}
      </View>

      <Button
        label={loading ? 'ממתין לתשלום...' : `המשך לתשלום ₪${selected ?? '...'}`}
        onPress={handleDeposit}
        disabled={!selected || loading}
        variant="accent"
        size="lg"
        block
      />

      <Button label="דלג לעכשיו" onPress={onContinue} disabled={loading} variant="ghost" style={styles.skip} block />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: rtl.row, flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  amtBtn: {
    flexBasis: '46%', flexGrow: 1, minHeight: 64, borderRadius: radii.md,
    borderWidth: 2, borderColor: colors.line, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  amtBtnPressed: { backgroundColor: colors.brandSoft },
  amtBtnSelected: { borderColor: colors.pine, backgroundColor: colors.sunSoft },
  amtText: { fontSize: 26, lineHeight: 32, color: colors.pine },
  amtTextSelected: { color: colors.pineDeep },
  skip: { marginTop: 12 },
});
