import { useState } from 'react';
import { api, setToken } from '../api/client.js';
import { verifyErrorMessage, verifyOtpBody } from '../lib/login.js';

interface Props {
  onLogin: () => void;
}

export function LoginPage({ onLogin }: Props) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('auth/send-otp', { json: { phone } });
      setStep('otp');
    } catch {
      setError('שגיאה בשליחת קוד. בדוק את מספר הטלפון.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { accessToken } = await api.post('auth/verify-otp', { json: verifyOtpBody(phone, code) }).json<{ accessToken: string }>();
      setToken(accessToken);
      onLogin();
    } catch (err) {
      setError(await verifyErrorMessage(err));
    } finally {
      setLoading(false);
    }
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
            {error && (
              <p className="alert alert-error" role="alert">
                {error}
              </p>
            )}
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
            {error && (
              <p className="alert alert-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" disabled={loading} className="btn btn-block">
              {loading ? 'מאמת...' : 'כניסה'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
