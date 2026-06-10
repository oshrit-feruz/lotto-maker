import { useState } from 'react';
import { api, setToken } from '../api/client.js';

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
      const { accessToken } = await api.post('auth/verify-otp', { json: { phone, code } }).json<{ accessToken: string }>();
      setToken(accessToken);
      onLogin();
    } catch {
      setError('קוד שגוי. נסה שנית.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', padding: 24, fontFamily: 'system-ui, sans-serif', direction: 'rtl' }}>
      <h1 style={{ textAlign: 'center' }}>כניסה לאופרטור</h1>

      {step === 'phone' ? (
        <form onSubmit={handleSendOtp}>
          <label>מספר טלפון (E.164)</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+972501234567"
            required
            style={inputStyle}
          />
          {error && <p style={{ color: '#e02424' }}>{error}</p>}
          <button type="submit" disabled={loading} style={primaryBtn}>
            {loading ? 'שולח...' : 'שלח קוד'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp}>
          <label>קוד אימות (6 ספרות)</label>
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            required
            style={inputStyle}
          />
          {error && <p style={{ color: '#e02424' }}>{error}</p>}
          <button type="submit" disabled={loading} style={primaryBtn}>
            {loading ? 'מאמת...' : 'כניסה'}
          </button>
        </form>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: 'block', width: '100%', padding: '10px 12px', fontSize: '1.1rem',
  borderRadius: 6, border: '1px solid #d1d5db', marginBottom: 12, boxSizing: 'border-box',
};
const primaryBtn: React.CSSProperties = {
  width: '100%', padding: 14, background: '#1a56db', color: '#fff',
  border: 'none', borderRadius: 6, fontSize: '1rem', cursor: 'pointer', fontWeight: 700,
};
