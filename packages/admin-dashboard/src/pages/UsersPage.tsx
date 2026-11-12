import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { searchUsers } from '../api/users';
import { Badge, Empty, QueryState } from '../components/ui';
import { formatDate, formatNis } from '../lib/format';
import { MIN_PHONE_SEARCH_DIGITS, nationalDigits, PHONE_SEARCH_HINT } from '../lib/phone';

export default function UsersPage() {
  const [input, setInput] = useState('');
  const [phone, setPhone] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['users', phone], queryFn: () => searchUsers(phone), enabled: phone !== '' });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const raw = input.trim();
    // The backend normalises the phone itself; check only that there is enough to search on.
    if (nationalDigits(raw).length < MIN_PHONE_SEARCH_DIGITS) {
      setHint(PHONE_SEARCH_HINT);
      return;
    }
    setHint(null);
    setPhone(raw);
  };

  return (
    <>
      <h1>משתמשים</h1>
      <form className="row" onSubmit={submit}>
        <label>
          חיפוש לפי טלפון (מלא או תחילית)
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setHint(null);
            }}
            dir="ltr"
            placeholder="050-0000000"
          />
        </label>
        <button type="submit" disabled={!input.trim()}>
          חפש
        </button>
      </form>
      {hint && (
        <p className="error" role="alert">
          {hint}
        </p>
      )}
      {phone === '' ? (
        <Empty>הזן לפחות 3 ספרות של מספר טלפון לחיפוש.</Empty>
      ) : (
        <QueryState q={q}>
          {(users) =>
            users.length === 0 ? (
              <Empty>לא נמצאו משתמשים.</Empty>
            ) : (
              <>
                {users.length >= 20 && <p className="muted">מוצגות 20 התוצאות החדשות ביותר – הזן מספר ארוך יותר לצמצום.</p>}
                <table>
                  <thead>
                    <tr>
                      <th>טלפון</th>
                      <th>שם</th>
                      <th>יתרה</th>
                      <th>סטטוס</th>
                      <th>בגיר מאומת</th>
                      <th>ת״ז (4 אחרונות)</th>
                      <th>נרשם</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td className="ltr">
                          <Link to={`/users/${u.id}`}>{u.phone}</Link>
                        </td>
                        <td>{u.fullName ?? '—'}</td>
                        <td>{formatNis(u.walletBalance)}</td>
                        <td>
                          <Badge tone={u.status === 'suspended' ? 'red' : 'green'}>{u.status === 'suspended' ? 'מושעה' : 'פעיל'}</Badge>
                        </td>
                        <td>{u.verifiedAdult ? 'כן' : 'לא'}</td>
                        <td className="ltr">{u.idLast4 ? `••••${u.idLast4}` : '—'}</td>
                        <td>{formatDate(u.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )
          }
        </QueryState>
      )}
    </>
  );
}
