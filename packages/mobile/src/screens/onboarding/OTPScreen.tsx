import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native';
import { AuthLayout } from '../../components/ui/index.js';
import { colors, fonts, radii, rtl, type } from '../../theme/index.js';
import { authApi, setToken, setRefreshToken } from '../../api/client.js';
import { usersApi } from '../../api/client.js';
import { useAuthStore } from '../../store/auth.store.js';
import { notify } from '../../lib/confirm.js';

interface Props {
  phone: string;
  /** Called with the loaded profile; the caller decides where onboarding goes next. */
  onVerified: (user: { verifiedAdult: boolean }) => void;
}

export function OTPScreen({ phone, onVerified }: Readonly<Props>) {
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
      const { accessToken, refreshToken } = await authApi.verifyOtp(phone, enteredCode);
      await Promise.all([setToken(accessToken), setRefreshToken(refreshToken)]);
      const user = await usersApi.getMe();
      setUser(user);
      onVerified(user);
    } catch {
      notify('קוד שגוי', 'הקוד שהזנת שגוי. נסה שנית.');
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
    <AuthLayout title="קוד אימות" subtitle={`שלחנו קוד ל-\u2066${phone}\u2069`}>
      <Text style={styles.label}>הקוד בן 6 ספרות</Text>
      <TextInput
        ref={inputRef}
        style={styles.codeInput}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        value={code}
        onChangeText={(v) => {
          setCode(v);
          if (v.length === 6) handleVerify(v);
        }}
        placeholder="------"
        placeholderTextColor={colors.emptyRing}
        textAlign="center"
        accessibilityLabel="קוד אימות"
        autoFocus
      />

      {loading && (
        <View style={styles.verifying}>
          <ActivityIndicator color={colors.pine} />
          <Text style={type.small}>מאמת...</Text>
        </View>
      )}

      <Pressable
        onPress={handleResend}
        disabled={countdown > 0}
        accessibilityRole="button"
        accessibilityState={{ disabled: countdown > 0 }}
        style={({ pressed }) => [styles.resendBtn, pressed && countdown <= 0 && styles.resendPressed]}
      >
        <Text style={[styles.resendText, countdown > 0 && styles.resendWaiting]}>
          {countdown > 0 ? `שלח שוב בעוד ${countdown}ש׳` : 'שלח קוד מחדש'}
        </Text>
      </Pressable>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, textAlign: rtl.textStart, marginBottom: 8 },
  codeInput: {
    fontFamily: fonts.display,
    fontSize: 34,
    letterSpacing: 12,
    minHeight: 64,
    borderWidth: 2,
    borderColor: colors.pine,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    color: colors.pineDeep,
    paddingVertical: 8,
    marginBottom: 16,
    writingDirection: 'ltr',
  },
  verifying: { flexDirection: rtl.row, alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 },
  resendBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, alignSelf: 'center', paddingHorizontal: 16 },
  resendPressed: { backgroundColor: colors.brandSoft },
  resendText: { fontFamily: fonts.bodyBold, color: colors.skyDeep, fontSize: 15, textDecorationLine: 'underline' },
  resendWaiting: { color: colors.muted, textDecorationLine: 'none', fontFamily: fonts.body },
});
