import { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { AuthLayout, Button, Field, Notice } from '../../components/ui/index.js';
import { colors, rtl, type } from '../../theme/index.js';
import { usersApi } from '../../api/client.js';
import { useAuthStore } from '../../store/auth.store.js';
import { notify } from '../../lib/confirm.js';

interface Props {
  onVerified: () => void;
}

export function KYCScreen({ onVerified }: Readonly<Props>) {
  const [fullName, setFullName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [dob, setDob] = useState('');
  const [loading, setLoading] = useState(false);
  const updateUser = useAuthStore((s) => s.updateUser);

  async function handleSubmit() {
    if (!fullName || !idNumber || !dob) {
      notify('שדות חסרים', 'אנא מלא את כל השדות.');
      return;
    }
    // Parse DD/MM/YYYY → YYYY-MM-DD
    const parts = dob.split('/');
    if (parts.length !== 3) {
      notify('תאריך שגוי', 'הזן תאריך בפורמט DD/MM/YYYY');
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
        notify('גיל לא מספיק', 'עליך להיות בן 18 ומעלה להשתמש בשירות זה.');
      } else if (e.code === 'INVALID_ID_NUMBER') {
        notify('תעודת זהות שגויה', 'מספר תעודת הזהות אינו תקין. בדוק את המספר ונסה שנית.');
      } else if (e.code === 'INVALID_DATE_OF_BIRTH') {
        notify('תאריך שגוי', 'תאריך הלידה אינו תקין.');
      } else if (e.code === 'KYC_PENDING') {
        // A returning user whose earlier check is waiting for manual review: let them in.
        notify('האימות בבדיקה', 'בדיקת הזהות שלך ממתינה לאישור. נעדכן כשתאושר.', { okText: 'המשך', onDismiss: onVerified });
      } else if (e.code === 'ID_NUMBER_ALREADY_USED') {
        notify('תעודת זהות בשימוש', 'מספר תעודת הזהות כבר רשום בחשבון אחר.');
      } else {
        notify('שגיאה', 'אירעה שגיאה. בדוק את הפרטים ונסה שנית.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="אימות זהות" subtitle="נדרש על-פי חוק. המידע מאובטח ומוגן.">
      <Field label="שם מלא" value={fullName} onChangeText={setFullName} placeholder="ישראל ישראלי" autoComplete="name" textContentType="name" />
      <Field label="מספר ת.ז." value={idNumber} onChangeText={setIdNumber} keyboardType="number-pad" placeholder="000000000" />
      <Field label="תאריך לידה" value={dob} onChangeText={setDob} placeholder="DD/MM/YYYY" keyboardType="numbers-and-punctuation" />

      <Notice tone="warn">
        <Text style={styles.legal}>
          * השירות מיועד לבני 18 ומעלה בלבד. אימות גיל הוא חובה חוקית.
        </Text>
      </Notice>

      <Button
        label={loading ? 'מאמת...' : 'אמת זהות'}
        onPress={handleSubmit}
        disabled={loading}
        variant="accent"
        size="lg"
        block
      />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  legal: { ...type.smallStrong, color: colors.warnInk, textAlign: rtl.textStart },
});
