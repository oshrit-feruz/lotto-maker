import { useState } from 'react';
import { AuthLayout, Button, Field } from '../../components/ui/index.js';
import { authApi } from '../../api/client.js';
import { notify } from '../../lib/confirm.js';

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
      notify('שגיאה', 'לא ניתן לשלוח קוד. בדוק את המספר ונסה שנית.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="ברוך הבא ללוטו מייקר" subtitle="הזן את מספר הטלפון שלך">
      <Field
        label="מספר טלפון"
        placeholder="050-000-0000"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        value={phone}
        onChangeText={setPhone}
      />
      <Button
        label={loading ? 'שולח...' : 'שלח קוד אימות'}
        onPress={handleSend}
        disabled={!phone || loading}
        variant="accent"
        size="lg"
        block
      />
    </AuthLayout>
  );
}
