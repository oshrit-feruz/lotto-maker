import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView,
} from 'react-native';
import { usersApi } from '../../api/client.js';
import { useAuthStore } from '../../store/auth.store.js';

interface Props {
  onVerified: () => void;
}

export function KYCScreen({ onVerified }: Props) {
  const [fullName, setFullName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [dob, setDob] = useState('');
  const [loading, setLoading] = useState(false);
  const updateUser = useAuthStore((s) => s.updateUser);

  async function handleSubmit() {
    if (!fullName || !idNumber || !dob) {
      Alert.alert('שדות חסרים', 'אנא מלא את כל השדות.');
      return;
    }
    // Parse DD/MM/YYYY → YYYY-MM-DD
    const parts = dob.split('/');
    if (parts.length !== 3) {
      Alert.alert('תאריך שגוי', 'הזן תאריך בפורמט DD/MM/YYYY');
      return;
    }
    const isoDate = `${parts[2]}-${parts[1]!.padStart(2, '0')}-${parts[0]!.padStart(2, '0')}`;

    setLoading(true);
    try {
      const { verifiedAdult } = await usersApi.kyc({ fullName, idNumber, dateOfBirth: isoDate });
      updateUser({ fullName, verifiedAdult });
      onVerified();
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === 'AGE_VERIFICATION_FAILED') {
        Alert.alert('גיל לא מספיק', 'עליך להיות בן 18 ומעלה להשתמש בשירות זה.');
      } else {
        Alert.alert('שגיאה', 'אירעה שגיאה. בדוק את הפרטים ונסה שנית.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>אימות זהות</Text>
      <Text style={styles.subtitle}>נדרש על-פי חוק. המידע מאובטח ומוגן.</Text>

      <Text style={styles.label}>שם מלא</Text>
      <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="ישראל ישראלי" textAlign="right" />

      <Text style={styles.label}>מספר ת.ז.</Text>
      <TextInput style={styles.input} value={idNumber} onChangeText={setIdNumber} keyboardType="number-pad" placeholder="000000000" textAlign="right" />

      <Text style={styles.label}>תאריך לידה</Text>
      <TextInput style={styles.input} value={dob} onChangeText={setDob} placeholder="DD/MM/YYYY" keyboardType="numbers-and-punctuation" textAlign="right" />

      <TouchableOpacity
        style={[styles.btn, loading && styles.btnDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        <Text style={styles.btnText}>{loading ? 'מאמת...' : 'אמת זהות'}</Text>
      </TouchableOpacity>

      <Text style={styles.legal}>
        * השירות מיועד לבני 18 ומעלה בלבד. אימות גיל הוא חובה חוקית.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, backgroundColor: '#fff', flexGrow: 1 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 8, marginTop: 24 },
  subtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 28 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6, textAlign: 'right' },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    padding: 12, fontSize: 16, marginBottom: 16,
  },
  btn: { backgroundColor: '#1a56db', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  legal: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 20 },
});
