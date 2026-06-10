import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { walletApi } from '../../api/client.js';
import { useAuthStore } from '../../store/auth.store.js';

const PRESET_AMOUNTS = [20, 50, 100, 200];

interface Props {
  onContinue: () => void;
}

export function WalletLoadScreen({ onContinue }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const updateUser = useAuthStore((s) => s.updateUser);

  async function handleDeposit() {
    if (!selected) return;
    setLoading(true);
    try {
      const result = await walletApi.deposit(selected) as { newBalance: string };
      updateUser({ walletBalance: result.newBalance });
      onContinue();
    } catch {
      Alert.alert('שגיאה', 'הטעינה נכשלה. נסה שנית.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>טען את הארנק</Text>
      <Text style={styles.subtitle}>בחר סכום לטעינה ראשונית</Text>

      <View style={styles.grid}>
        {PRESET_AMOUNTS.map((amt) => (
          <TouchableOpacity
            key={amt}
            onPress={() => setSelected(amt)}
            style={[styles.amtBtn, selected === amt && styles.amtBtnSelected]}
          >
            <Text style={[styles.amtText, selected === amt && styles.amtTextSelected]}>
              ₪{amt}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.btn, (!selected || loading) && styles.btnDisabled]}
        onPress={handleDeposit}
        disabled={!selected || loading}
      >
        <Text style={styles.btnText}>{loading ? 'טוען...' : `טען ₪${selected ?? '...'}`}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onContinue} style={styles.skipBtn}>
        <Text style={styles.skipText}>דלג לעכשיו</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#6b7280', textAlign: 'center', marginBottom: 32 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginBottom: 28 },
  amtBtn: {
    width: 140, padding: 20, borderRadius: 12,
    borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center',
  },
  amtBtnSelected: { borderColor: '#1a56db', backgroundColor: '#eff6ff' },
  amtText: { fontSize: 22, fontWeight: '700', color: '#374151' },
  amtTextSelected: { color: '#1a56db' },
  btn: { backgroundColor: '#1a56db', borderRadius: 10, padding: 16, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skipBtn: { alignItems: 'center', marginTop: 16 },
  skipText: { color: '#9ca3af', fontSize: 14 },
});
