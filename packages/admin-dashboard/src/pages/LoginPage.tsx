import { useState, type FormEvent } from 'react';
import { sendOtp } from '../api/auth';
import { useAuth } from '../auth/AuthContext';
import { toE164 } from '../lib/phone';

export default function LoginPage() {
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (step === 'phone') {
        await sendOtp(toE164(phone));
        setStep('code');
      } else {
        await login(toE164(phone), code);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <h1>כניסת מנהל</h1>
        {step === 'phone' ? (
          <label>
            טלפון
            <input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" placeholder="050-0000000" autoFocus />
          </label>
        ) : (
          <label>
            קוד אימות שנשלח ל-{phone}
            <input value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" inputMode="numeric" maxLength={6} autoFocus />
          </label>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy || (step === 'phone' ? !phone : code.length !== 6)}>
          {busy ? 'רגע…' : step === 'phone' ? 'שלח קוד' : 'כניסה'}
        </button>
        {step === 'code' && (
          <button
            type="button"
            className="link"
            onClick={() => {
              setStep('phone');
              setCode('');
            }}
          >
            החלף מספר
          </button>
        )}
      </form>
    </div>
  );
}
