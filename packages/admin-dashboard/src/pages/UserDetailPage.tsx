import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { getUser, suspendUser, unsuspendUser } from '../api/users';
import type { AdminUserDetail } from '../api/types';
import { ConfirmDialog } from '../components/Dialog';
import { Badge, Empty, QueryState } from '../components/ui';
import { formatDate, formatNis } from '../lib/format';

export default function UserDetailPage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['user', id], queryFn: () => getUser(id) });
  return (
    <>
      <p>
        <Link to="/users">← משתמשים</Link>
      </p>
      <QueryState q={q}>{(u) => <UserView user={u} />}</QueryState>
    </>
  );
}

function UserView({ user }: { user: AdminUserDetail }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const suspended = user.status === 'suspended';
  const toggle = useMutation({
    mutationFn: () => (suspended ? unsuspendUser(user.id) : suspendUser(user.id)),
    onSuccess: () => {
      setConfirming(false);
      void qc.invalidateQueries({ queryKey: ['user', user.id] });
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
  });

  return (
    <>
      <h1 className="ltr">{user.phone}</h1>
      <div className="card">
        <p>
          יתרה: <strong>{formatNis(user.balance)}</strong>
        </p>
        <p>
          סטטוס: <Badge tone={suspended ? 'red' : 'green'}>{suspended ? 'מושעה' : 'פעיל'}</Badge>
        </p>
        <p>בגיר מאומת: {user.verifiedAdult ? 'כן' : 'לא'}</p>
        <p>
          ת״ז: <span className="ltr">{user.idLast4 ? `••••${user.idLast4}` : '—'}</span>
        </p>
        <button className={suspended ? '' : 'danger'} onClick={() => setConfirming(true)}>
          {suspended ? 'בטל השעיה' : 'השעה משתמש'}
        </button>
      </div>

      <div className="grid2">
        <div className="card">
          <h2>הזמנות</h2>
          {user.orders.length === 0 ? (
            <Empty />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>סטטוס</th>
                  <th>סכום</th>
                </tr>
              </thead>
              <tbody>
                {user.orders.map((o) => (
                  <tr key={o.id}>
                    <td>{formatDate(o.createdAt)}</td>
                    <td>{o.status}</td>
                    <td>{o.total === undefined ? '—' : formatNis(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h2>תנועות ארנק</h2>
          {user.walletTransactions.length === 0 ? (
            <Empty />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>סוג</th>
                  <th>סכום</th>
                </tr>
              </thead>
              <tbody>
                {user.walletTransactions.map((t) => (
                  <tr key={t.id}>
                    <td>{formatDate(t.createdAt)}</td>
                    <td>{t.type}</td>
                    <td>{formatNis(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          title={suspended ? 'ביטול השעיה' : 'השעיית משתמש'}
          confirmLabel={suspended ? 'בטל השעיה' : 'השעה'}
          danger={!suspended}
          busy={toggle.isPending}
          error={toggle.isError ? (toggle.error as Error).message : null}
          onConfirm={() => toggle.mutate()}
          onCancel={() => {
            toggle.reset();
            setConfirming(false);
          }}
        >
          <p className="ltr">{user.phone}</p>
        </ConfirmDialog>
      )}
    </>
  );
}
