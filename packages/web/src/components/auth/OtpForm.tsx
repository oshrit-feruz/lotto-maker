'use client';

import { useState } from 'react';
import { ApiError, api, auth, errorMessage } from '@/lib/api-client';
import { toE164IsraeliMobile } from '@/lib/phone';
import type { Me } from '@/lib/types';

/**
 * Phone number, then the SMS code. Calls `onVerified` with the profile once the session cookies
 * are set. Used by the /login page and by the in-place login dialog on the ticket form.
 */
export function OtpForm({ onVerified }: Readonly<{ onVerified: (me: Me) => void }>) {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
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

  async function verify(value: string) {
    if (busy) return;
    setError(null);
    if (!/^\d{6}$/.test(value)) {
      setError('הקוד מורכב מ־6 ספרות.');
      return;
    }
    setBusy(true);
    try {
      await auth.verifyOtp(phone, value);
      onVerified(await api.get<Me>('me'));
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 && err.code === 'UNAUTHORIZED' ? 'הקוד שגוי.' : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const alert = error ? (
    <div className="alert alert-error" role="alert">
      {error}
    </div>
  ) : null;

  if (step === 'phone') {
    return (
      <form onSubmit={sendCode} noValidate>
        {alert}
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
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void verify(code);
      }}
      noValidate
    >
      {alert}
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
          onChange={(e) => {
            const value = e.target.value.replace(/\D/g, '').slice(0, 6);
            setCode(value);
            // The sixth digit (typed or filled from the SMS) sends the code: no extra tap.
            if (value.length === 6) void verify(value);
          }}
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
  );
}
