import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { authApi, setToken, setRefreshToken } from '../../api/client.js';
import { usersApi } from '../../api/client.js';
import { useAuthStore } from '../../store/auth.store.js';

interface Props {
  phone: string;
  onVerified: (isNewUser: boolean) => void;
}

export function OTPScreen({ phone, onVerified }: Props) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const setUser = useAuthStore((s) => s.setUser);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  async function handleVerify(enteredCode: string) {
    if (enteredCode.length !== 6) return;
    setLoading(true);
    try {
      const { accessToken, refreshToken, isNewUser } = await authApi.verifyOtp(phone, enteredCode);
      await Promise.all([setToken(accessToken), setRefreshToken(refreshToken)]);
      const user = await usersApi.getMe();
      setUser(user);
      onVerified(isNewUser);
    } catch {
      Alert.alert('קוד שגוי', 'הקוד שהזנת שגוי. נסה שנית.');
      setCode('');
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    await authApi.sendOtp(phone);
    setCountdown(60);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>קוד אימות</Text>
      <Text style={styles.subtitle}>שלחנו קוד ל-{phone}</Text>

      <TextInput
        ref={inputRef}
        style={styles.codeInput}
        keyboardType="number-pad"
        maxLength={6}
        value={code}
        onChangeText={(v) => {
          setCode(v);
          if (v.length === 6) handleVerify(v);
        }}
        placeholder="------"
        textAlign="center"
        autoFocus
      />

      {loading && <Text style={{ textAlign: 'center', color: '#6b7280' }}>מאמת...</Text>}

      <TouchableOpacity
        onPress={handleResend}
        disabled={countdown > 0}
        style={styles.resendBtn}
      >
        <Text style={[styles.resendText, countdown > 0 && { color: '#9ca3af' }]}>
          {countdown > 0 ? `שלח שוב בעוד ${countdown}ש׳` : 'שלח קוד מחדש'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#6b7280', textAlign: 'center', marginBottom: 32 },
  codeInput: {
    fontSize: 36, fontWeight: '700', letterSpacing: 12,
    borderBottomWidth: 2, borderColor: '#1a56db',
    marginHorizontal: 40, paddingBottom: 8, marginBottom: 24,
  },
  resendBtn: { alignItems: 'center', marginTop: 8 },
  resendText: { color: '#1a56db', fontSize: 15, fontWeight: '600' },
});
