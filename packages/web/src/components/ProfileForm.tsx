'use client';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/api-client';
import { isValidIsraeliId, normalizeIsraeliId } from '@/lib/israeli-id';

/** KYC: POST /me/kyc {fullName, idNumber, dateOfBirth}. The backend re-validates everything. */
export function ProfileForm({ onDone }: { onDone: () => void }) {
  const [fullName, setFullName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [dob, setDob] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (fullName.trim().length < 2) e.fullName = 'נא להזין שם מלא.';
    if (!isValidIsraeliId(idNumber)) e.idNumber = 'מספר תעודת הזהות אינו תקין (בדקו את ספרת הביקורת).';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) e.dob = 'נא לבחור תאריך לידה.';
    else {
      const d = new Date(`${dob}T00:00:00`);
      const adult = new Date(d.getFullYear() + 18, d.getMonth(), d.getDate());
      if (Number.isNaN(d.getTime()) || d > new Date()) e.dob = 'תאריך הלידה אינו תקין.';
      else if (adult > new Date()) e.dob = 'השירות מיועד לבני 18 ומעלה בלבד.';
    }
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setBusy(true);
    try {
      await api.post('me/kyc', {
        fullName: fullName.trim(),
        idNumber: normalizeIsraeliId(idNumber),
        dateOfBirth: dob,
      });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="fullName">שם מלא (כפי שמופיע בתעודת הזהות)</label>
        <input
          id="fullName"
          className="input"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          aria-invalid={Boolean(errors.fullName)}
        />
        {errors.fullName ? <div className="field-error">{errors.fullName}</div> : null}
      </div>
      <div className="field">
        <label htmlFor="idNumber">מספר תעודת זהות</label>
        <input
          id="idNumber"
          className="input"
          inputMode="numeric"
          dir="ltr"
          maxLength={9}
          value={idNumber}
          onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, ''))}
          aria-invalid={Boolean(errors.idNumber)}
        />
        {errors.idNumber ? <div className="field-error">{errors.idNumber}</div> : null}
      </div>
      <div className="field">
        <label htmlFor="dob">תאריך לידה</label>
        <input
          id="dob"
          className="input"
          type="date"
          autoComplete="bday"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          aria-invalid={Boolean(errors.dob)}
        />
        {errors.dob ? <div className="field-error">{errors.dob}</div> : null}
      </div>
      <button className="btn btn-block" type="submit" disabled={busy}>
        {busy ? 'שומר…' : 'שמירה והמשך'}
      </button>
    </form>
  );
}
