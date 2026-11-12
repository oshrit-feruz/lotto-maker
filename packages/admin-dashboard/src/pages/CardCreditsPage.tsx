import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorText } from '../api/errors';
import { listCardCredits, markCardCreditPaid } from '../api/payouts';
import type { CardCredit, CardCreditStatus } from '../api/types';
import { ConfirmDialog } from '../components/Dialog';
import RequesterLink from '../components/RequesterLink';
import { Badge, Empty, Pager, QueryState } from '../components/ui';
import { formatDate, formatNis } from '../lib/format';

import { CARD_CREDIT_STATUS_LABEL, labelOf } from '../lib/labels';
export { CARD_CREDIT_STATUS_LABEL };
const STATUS_TONE: Record<CardCreditStatus, 'green' | 'red' | 'amber' | 'blue'> = {
  pending: 'amber',
  processing: 'blue',
  paid: 'green',
  failed: 'red',
};

/** Where the money comes from: a prize above the wallet cap, or a released withdrawal. */
function source(c: CardCredit): string {
  if (c.withdrawalId) return `משיכה ${c.withdrawalId.slice(-8)}`;
  if (c.orderId) return `זכייה ${c.orderId.slice(-8)}`;
  return '—';
}
const LAST_ERROR_LABEL: Record<string, string> = {
  NO_SAVED_CARD: 'אין כרטיס שמור',
  PROVIDER_ERROR: 'שגיאת ספק סליקה',
  PROVIDER_DECLINED: 'הספק דחה את הזיכוי',
};
const REFERENCE_MAX = 100;

export default function CardCreditsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<CardCreditStatus>('pending');
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<CardCredit | null>(null);
  const [reference, setReference] = useState('');
  const q = useQuery({
    queryKey: ['card-credits', status, page],
    queryFn: () => listCardCredits(status, page),
  });
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
      <p className="muted">
        סכומים שלא נכנסו לארנק בגלל התקרה: זכיות, ומשיכות שבוטלו או נדחו. המערכת מנסה לזכות את הכרטיס שוב ושוב; ניתן
        לשלם בדרך אחרת ולסמן כשולם, אך לא בזמן שהמערכת מבצעת את הזיכוי.
      </p>
      <div className="row">
        <label>
          סטטוס
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as CardCreditStatus);
              setPage(1);
            }}
          >
            {Object.entries(CARD_CREDIT_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <QueryState q={q}>
        {({ items, total, pageSize }) => (
          <>
            {items.length === 0 ? (
              <Empty />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>נוצר</th>
                    <th>משתמש</th>
                    <th>מקור</th>
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
                      <td>
                        <RequesterLink userId={c.userId} user={c.user} />
                      </td>
                      <td>{source(c)}</td>
                      <td>{formatNis(c.amount)}</td>
                      <td>{c.attempts}</td>
                      <td>{c.status === 'paid' ? formatDate(c.paidAt) : formatDate(c.nextAttemptAt)}</td>
                      <td>
                        {c.manualReference
                          ? `אסמכתה: ${c.manualReference}`
                          : c.lastError
                            ? labelOf(LAST_ERROR_LABEL, c.lastError)
                            : ''}
                      </td>
                      <td>
                        <Badge tone={Object.hasOwn(STATUS_TONE, c.status) ? STATUS_TONE[c.status] : 'gray'}>
                          {labelOf(CARD_CREDIT_STATUS_LABEL, c.status)}
                        </Badge>
                      </td>
                      <td>{c.status === 'pending' && <button onClick={() => setTarget(c)}>סמן כשולם</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {(total > pageSize || page > 1) && <Pager page={page} pageSize={pageSize} total={total} onPage={setPage} />}
          </>
        )}
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
            זיכוי כרטיס בסך <strong>{formatNis(target.amount)}</strong> יסומן כשולם והמערכת תפסיק לנסות לזכות את הכרטיס.
            לא ניתן לבטל.
          </p>
          <label>
            אסמכתת התשלום (למשל מספר העברה בנקאית)
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={REFERENCE_MAX}
              dir="ltr"
              autoFocus
            />
          </label>
        </ConfirmDialog>
      )}
    </>
  );
}
