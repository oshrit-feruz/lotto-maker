import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { errorText } from '../api/errors';
import { getUser, suspendUser, unsuspendUser } from '../api/users';
import type { AdminUserDetail } from '../api/types';
import { ConfirmDialog } from '../components/Dialog';
import { Badge, Empty, QueryState } from '../components/ui';
import { formatDate, formatNis } from '../lib/format';

const ORDER_STATUS: Record<string, string> = {
  pending: 'ממתינה',
  in_queue: 'בתור',
  keyed: 'הוקלדה',
  scanned: 'נסרקה',
  won: 'זכתה',
  lost: 'לא זכתה',
  refunded: 'הוחזרה',
  results_delayed: 'תוצאות מתעכבות',
  cancelled: 'בוטלה',
};
const TX_TYPE: Record<string, string> = {
  deposit: 'הפקדה',
  charge: 'חיוב',
  refund: 'החזר',
  winning: 'זכייה',
  refund_reversal: 'ביטול החזר',
  withdrawal_hold: 'משיכה (הקפאה)',
  withdrawal_release: 'שחרור משיכה',
};

/** The backend accepts a reason of 2–500 characters. Required here for a suspension. */
export const REASON_MIN = 2;
export const REASON_MAX = 500;

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

export function UserView({ user }: { user: AdminUserDetail }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const suspended = user.status === 'suspended';
  const trimmed = reason.trim();
  const reasonValid = suspended
    ? trimmed === '' || (trimmed.length >= REASON_MIN && trimmed.length <= REASON_MAX)
    : trimmed.length >= REASON_MIN && trimmed.length <= REASON_MAX;

  const toggle = useMutation({
    mutationFn: () => (suspended ? unsuspendUser(user.id, trimmed) : suspendUser(user.id, trimmed)),
    onSuccess: (res) => {
      close();
      setNotice(res.changed ? null : 'הסטטוס כבר היה מעודכן – לא בוצע שינוי.');
      void qc.invalidateQueries({ queryKey: ['user', user.id] });
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
  function close() {
    toggle.reset();
    setReason('');
    setConfirming(false);
  }

  return (
    <>
      <h1 className="ltr">{user.phone}</h1>
      <div className="card">
        <p>שם: {user.fullName ?? '—'}</p>
        <p>
          יתרה: <strong>{formatNis(user.walletBalance)}</strong>
        </p>
        <p>
          סטטוס: <Badge tone={suspended ? 'red' : 'green'}>{suspended ? 'מושעה' : 'פעיל'}</Badge>
        </p>
        <p>בגיר מאומת: {user.verifiedAdult ? 'כן' : 'לא'}</p>
        <p>
          ת״ז: <span className="ltr">{user.idLast4 ? `••••${user.idLast4}` : '—'}</span>
        </p>
        <p>נרשם: {formatDate(user.createdAt)}</p>
        {suspended && (
          <p className="muted">משתמש מושעה אינו יכול להזמין, להפקיד או למשוך, אך יכול להתחבר, לצפות בחשבון ולאסוף זכיות.</p>
        )}
        {notice && <p className="muted">{notice}</p>}
        <button
          className={suspended ? '' : 'danger'}
          onClick={() => {
            setNotice(null);
            setConfirming(true);
          }}
        >
          {suspended ? 'בטל השעיה' : 'השעה משתמש'}
        </button>
      </div>

      <div className="grid2">
        <div className="card">
          <h2>הזמנות (50 אחרונות)</h2>
          {user.orders.length === 0 ? (
            <Empty />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>הגרלה</th>
                  <th>סטטוס</th>
                  <th>סכום</th>
                </tr>
              </thead>
              <tbody>
                {user.orders.map((o) => (
                  <tr key={o.id}>
                    <td>{formatDate(o.createdAt)}</td>
                    <td>{o.drawNumber ?? '—'}</td>
                    <td>{ORDER_STATUS[o.status] ?? o.status}</td>
                    <td>{formatNis(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h2>תנועות ארנק (50 אחרונות)</h2>
          {user.walletTransactions.length === 0 ? (
            <Empty />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>סוג</th>
                  <th>תיאור</th>
                  <th>סכום</th>
                </tr>
              </thead>
              <tbody>
                {user.walletTransactions.map((t) => (
                  <tr key={t.id}>
                    <td>{formatDate(t.createdAt)}</td>
                    <td>{TX_TYPE[t.type] ?? t.type}</td>
                    <td>{t.description ?? ''}</td>
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
          confirmDisabled={!reasonValid}
          danger={!suspended}
          busy={toggle.isPending}
          error={toggle.isError ? errorText(toggle.error) : null}
          onConfirm={() => toggle.mutate()}
          onCancel={close}
        >
          <p className="ltr">{user.phone}</p>
          <label>
            {suspended ? 'סיבה (רשות)' : 'סיבת ההשעיה'}
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={REASON_MAX} rows={3} autoFocus />
          </label>
          <p className="muted">הסיבה נשמרת ביומן הביקורת.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
