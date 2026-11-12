import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { errorText } from '../api/errors';
import { listCardCredits, markCardCreditPaid } from '../api/payouts';
import type { CardCredit, CardCreditStatus } from '../api/types';
import { ConfirmDialog } from '../components/Dialog';
import { Badge, Empty, QueryState } from '../components/ui';
import { formatDate, formatNis } from '../lib/format';

export const CARD_CREDIT_STATUS_LABEL: Record<CardCreditStatus, string> = {
  pending: 'ממתין',
  paid: 'שולם',
  failed: 'נכשל',
};
const LAST_ERROR_LABEL: Record<string, string> = {
  NO_SAVED_CARD: 'אין כרטיס שמור',
  PROVIDER_ERROR: 'שגיאת ספק סליקה',
  PROVIDER_DECLINED: 'הספק דחה את הזיכוי',
};
const REFERENCE_MAX = 100;

export default function CardCreditsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<CardCreditStatus>('pending');
  const [target, setTarget] = useState<CardCredit | null>(null);
  const [reference, setReference] = useState('');
  const q = useQuery({ queryKey: ['card-credits', status], queryFn: () => listCardCredits(status) });
  const pay = useMutation({
    mutationFn: (v: { id: string; reference: string }) => markCardCreditPaid(v.id, v.reference),
    onSuccess: () => {
      close();
      void qc.invalidateQueries({ queryKey: ['card-credits'] });
    },
    onError: () => void qc.invalidateQueries({ queryKey: ['card-credits'] }),
  });
  function close() {
    pay.reset();
    setReference('');
    setTarget(null);
  }
  const ref = reference.trim();

  return (
    <>
      <h1>זיכויי כרטיס</h1>
      <p className="muted">סכומי זכייה מעל תקרת הארנק. המערכת מנסה לזכות את הכרטיס שוב ושוב; ניתן לשלם בדרך אחרת ולסמן כשולם.</p>
      <div className="row">
        <label>
          סטטוס
          <select value={status} onChange={(e) => setStatus(e.target.value as CardCreditStatus)}>
            {Object.entries(CARD_CREDIT_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <QueryState q={q}>
        {(items) =>
          items.length === 0 ? (
            <Empty />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>נוצר</th>
                  <th>משתמש</th>
                  <th>הזמנה</th>
                  <th>סכום</th>
                  <th>ניסיונות</th>
                  <th>ניסיון הבא / שולם</th>
                  <th>הערות</th>
                  <th>סטטוס</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td>{formatDate(c.createdAt)}</td>
                    <td className="ltr">
                      <Link to={`/users/${c.userId}`}>{c.userId.slice(-8)}</Link>
                    </td>
                    <td className="ltr">{c.orderId.slice(-8)}</td>
                    <td>{formatNis(c.amount)}</td>
                    <td>{c.attempts}</td>
                    <td>{c.status === 'paid' ? formatDate(c.paidAt) : formatDate(c.nextAttemptAt)}</td>
                    <td>
                      {c.manualReference
                        ? `אסמכתה: ${c.manualReference}`
                        : c.lastError
                          ? (LAST_ERROR_LABEL[c.lastError] ?? c.lastError)
                          : ''}
                    </td>
                    <td>
                      <Badge tone={c.status === 'paid' ? 'green' : c.status === 'failed' ? 'red' : 'amber'}>
                        {CARD_CREDIT_STATUS_LABEL[c.status] ?? c.status}
                      </Badge>
                    </td>
                    <td>{c.status === 'pending' && <button onClick={() => setTarget(c)}>סמן כשולם</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </QueryState>
      {target && (
        <ConfirmDialog
          title="סימון זיכוי כשולם"
          confirmLabel="סמן כשולם"
          confirmDisabled={ref.length < 1 || ref.length > REFERENCE_MAX}
          busy={pay.isPending}
          error={pay.isError ? errorText(pay.error) : null}
          onConfirm={() => pay.mutate({ id: target.id, reference: ref })}
          onCancel={close}
        >
          <p>
            זיכוי כרטיס בסך <strong>{formatNis(target.amount)}</strong> יסומן כשולם והמערכת תפסיק לנסות לזכות את הכרטיס. לא ניתן
            לבטל.
          </p>
          <label>
            אסמכתת התשלום (למשל מספר העברה בנקאית)
            <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={REFERENCE_MAX} dir="ltr" autoFocus />
          </label>
        </ConfirmDialog>
      )}
    </>
  );
}
