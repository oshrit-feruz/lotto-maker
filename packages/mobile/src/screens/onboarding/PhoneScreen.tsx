import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { authApi } from '../../api/client.js';

interface Props {
  onOtpSent: (phone: string) => void;
}

export function PhoneScreen({ onOtpSent }: Props) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    const normalized = phone.startsWith('+') ? phone : `+972${phone.replace(/^0/, '')}`;
    setLoading(true);
    try {
      await authApi.sendOtp(normalized);
      onOtpSent(normalized);
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לשלוח קוד. בדוק את המספר ונסה שנית.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ברוך הבא ללוטו מייקר</Text>
      <Text style={styles.subtitle}>הזן את מספר הטלפון שלך</Text>
      <TextInput
        style={styles.input}
        placeholder="050-000-0000"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
        textAlign="right"
      />
      <TouchableOpacity
        style={[styles.btn, (!phone || loading) && styles.btnDisabled]}
        onPress={handleSend}
        disabled={!phone || loading}
      >
        <Text style={styles.btnText}>{loading ? 'שולח...' : 'שלח קוד אימות'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#6b7280', textAlign: 'center', marginBottom: 32 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    padding: 14, fontSize: 18, marginBottom: 16,
  },
  btn: { backgroundColor: '#1a56db', borderRadius: 10, padding: 16, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
