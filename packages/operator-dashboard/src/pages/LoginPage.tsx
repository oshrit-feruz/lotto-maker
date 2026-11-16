import { useState } from 'react';
import { api, setToken } from '../api/client.js';
import { sendErrorMessage, verifyErrorMessage, verifyOtpBody } from '../lib/login.js';

interface Props {
  onLogin: () => void;
}

function ErrorAlert({ error }: Readonly<{ error: string }>) {
  if (!error) return null;
  return (
    <p className="alert alert-error" role="alert">
      {error}
    </p>
  );
}

export function LoginPage({ onLogin }: Readonly<Props>) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /** Runs one login call, showing its failure inline (never through the session-ending 401 path). */
  function submit(call: () => Promise<void>, toMessage: (err: unknown) => Promise<string>) {
    setLoading(true);
    setError('');
    call()
      .catch(async (err: unknown) => setError(await toMessage(err)))
      .finally(() => setLoading(false));
  }

  function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    submit(async () => {
      await api.post('auth/send-otp', { json: { phone } });
      setStep('otp');
    }, sendErrorMessage);
  }

  function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    submit(async () => {
      const { accessToken } = await api.post('auth/verify-otp', { json: verifyOtpBody(phone, code) }).json<{ accessToken: string }>();
      setToken(accessToken);
      onLogin();
    }, verifyErrorMessage);
  }

  return (
    <div className="login">
      <div className="stub">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true" />
          עמדת הקלדה
        </div>
        <h1>כניסה לאופרטור</h1>
        <div className="perf" aria-hidden="true" />

        {step === 'phone' ? (
          <form onSubmit={handleSendOtp}>
            <div className="field">
              <label htmlFor="op-phone">מספר טלפון (E.164)</label>
              <input
                id="op-phone"
                className="input ltr"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+972501234567"
                required
              />
            </div>
            <ErrorAlert error={error} />
            <button type="submit" disabled={loading} className="btn btn-block">
              {loading ? 'שולח...' : 'שלח קוד'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <div className="field">
              <label htmlFor="op-code">קוד אימות (6 ספרות)</label>
              <input
                id="op-code"
                className="input input-digits"
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={6}
                required
              />
            </div>
            <ErrorAlert error={error} />
            <button type="submit" disabled={loading} className="btn btn-block">
              {loading ? 'מאמת...' : 'כניסה'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
