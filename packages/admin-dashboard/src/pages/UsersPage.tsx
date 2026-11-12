import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { searchUsers } from '../api/users';
import { Badge, Empty, QueryState } from '../components/ui';
import { formatNis } from '../lib/format';
import { toE164 } from '../lib/phone';

export default function UsersPage() {
  const [input, setInput] = useState('');
  const [phone, setPhone] = useState('');
  const q = useQuery({ queryKey: ['users', phone], queryFn: () => searchUsers(phone), enabled: phone !== '' });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setPhone(input.trim() ? toE164(input.trim()) : '');
  };

  return (
    <>
      <h1>משתמשים</h1>
      <form className="row" onSubmit={submit}>
        <label>
          חיפוש לפי טלפון
          <input value={input} onChange={(e) => setInput(e.target.value)} dir="ltr" placeholder="050-0000000" />
        </label>
        <button type="submit" disabled={!input.trim()}>
          חפש
        </button>
      </form>
      {phone === '' ? (
        <Empty>הזן מספר טלפון לחיפוש.</Empty>
      ) : (
        <QueryState q={q}>
          {(users) =>
            users.length === 0 ? (
              <Empty>לא נמצאו משתמשים.</Empty>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>טלפון</th>
                    <th>יתרה</th>
                    <th>סטטוס</th>
                    <th>בגיר מאומת</th>
                    <th>ת״ז (4 אחרונות)</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="ltr">
                        <Link to={`/users/${u.id}`}>{u.phone}</Link>
                      </td>
                      <td>{formatNis(u.balance)}</td>
                      <td>
                        <Badge tone={u.status === 'suspended' ? 'red' : 'green'}>{u.status === 'suspended' ? 'מושעה' : 'פעיל'}</Badge>
                      </td>
                      <td>{u.verifiedAdult ? 'כן' : 'לא'}</td>
                      <td className="ltr">{u.idLast4 ? `••••${u.idLast4}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </QueryState>
      )}
    </>
  );
}
