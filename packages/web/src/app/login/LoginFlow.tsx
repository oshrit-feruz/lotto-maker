'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ApiError, api, auth, errorMessage, safeNextPath } from '@/lib/api-client';
import { toE164IsraeliMobile } from '@/lib/phone';
import type { Me } from '@/lib/types';
import { ProfileForm } from '@/components/ProfileForm';

type Step = 'phone' | 'code' | 'profile';

export function LoginFlow() {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get('next'));
  const [step, setStep] = useState<Step>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const e164 = toE164IsraeliMobile(phoneInput);
    if (!e164) {
      setError('הזינו מספר טלפון נייד ישראלי תקין, למשל 050-1234567.');
      return;
    }
    setBusy(true);
    try {
      await auth.sendOtp(e164);
      setPhone(e164);
      setStep('code');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) {
      setError('הקוד מורכב מ־6 ספרות.');
      return;
    }
    setBusy(true);
    try {
      await auth.verifyOtp(phone, code);
      // First login, or a profile that was never completed: KYC step.
      const me = await api.get<Me>('me');
      if (!me.verifiedAdult) {
        setStep('profile');
      } else {
        router.replace(next);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 && err.code === 'UNAUTHORIZED' ? 'הקוד שגוי.' : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (step === 'profile') {
    return (
      <div className="card">
        <h1>השלמת פרטים</h1>
        <p className="muted">
          לפני ההזמנה הראשונה עלינו לוודא שאתם מעל גיל 18. הפרטים נשמרים מוצפנים ומשמשים לאימות גיל ולגביית זכיות.
        </p>
        <ProfileForm
          onDone={() => {
            router.replace(next);
            router.refresh();
          }}
        />
      </div>
    );
  }

  return (
    <div className="card">
      <h1>התחברות</h1>
      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      {step === 'phone' ? (
        <form onSubmit={sendCode} noValidate>
          <div className="field">
            <label htmlFor="phone">מספר טלפון נייד</label>
            <input
              id="phone"
              className="input"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              dir="ltr"
              placeholder="050-1234567"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              required
            />
          </div>
          <button className="btn btn-block" type="submit" disabled={busy}>
            {busy ? 'שולח…' : 'שלחו לי קוד'}
          </button>
          <p className="small muted" style={{ marginTop: 12 }}>
            השירות מיועד לבני 18 ומעלה בלבד.
          </p>
        </form>
      ) : (
        <form onSubmit={verify} noValidate>
          <p>
            שלחנו קוד בן 6 ספרות ל־<span dir="ltr">{phone}</span>.
          </p>
          <div className="field">
            <label htmlFor="code">קוד אימות</label>
            <input
              id="code"
              className="input"
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
            />
          </div>
          <button className="btn btn-block" type="submit" disabled={busy}>
            {busy ? 'מאמת…' : 'כניסה'}
          </button>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => sendCode()} disabled={busy}>
              שליחת קוד חדש
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setStep('phone');
                setCode('');
              }}
            >
              שינוי מספר
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
