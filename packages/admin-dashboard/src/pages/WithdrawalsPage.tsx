import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorText } from '../api/errors';
import { approveWithdrawal, listWithdrawals, markWithdrawalPaid, rejectWithdrawal } from '../api/payouts';
import type { WithdrawalListItem as Withdrawal, WithdrawalStatus } from '../api/types';
import BankDetailsReveal from '../components/BankDetailsReveal';
import { ConfirmDialog } from '../components/Dialog';
import RequesterLink from '../components/RequesterLink';
import { Badge, Empty, Pager, QueryState } from '../components/ui';
import { formatDate, formatNis } from '../lib/format';
import {
  canApprove,
  canMarkPaid,
  canReject,
  REFERENCE_MAX,
  REJECT_REASON_MAX,
  REJECT_REASON_MIN,
  WITHDRAWAL_METHOD_LABEL,
  WITHDRAWAL_STATUSES,
  WITHDRAWAL_STATUS_LABEL,
  WITHDRAWAL_STATUS_TONE,
} from '../lib/withdrawals';

type Action = { kind: 'approve' | 'reject' | 'pay'; w: Withdrawal };

const TITLE: Record<Action['kind'], string> = {
  approve: 'אישור משיכה',
  reject: 'דחיית משיכה',
  pay: 'סימון כשולמה',
};

/** What the notes column shows: the reject / failure reason, else the transfer reference. */
function notes(w: Withdrawal): string {
  if (w.failureReason) return w.failureReason;
  if (w.bankReference) return `אסמכתה: ${w.bankReference}`;
  return '';
}

export default function WithdrawalsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<WithdrawalStatus>('requested');
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<Action | null>(null);
  const [text, setText] = useState('');
  const q = useQuery({
    queryKey: ['withdrawals', status, page],
    queryFn: () => listWithdrawals(status, page),
  });

  const run = useMutation({
    mutationFn: (a: Action & { text: string }) => {
      if (a.kind === 'approve') return approveWithdrawal(a.w.id);
      if (a.kind === 'reject') return rejectWithdrawal(a.w.id, a.text.trim());
      return markWithdrawalPaid(a.w.id, a.text.trim());
    },
    onSuccess: () => {
      close();
      void qc.invalidateQueries({ queryKey: ['withdrawals'] });
    },
    onError: () => void qc.invalidateQueries({ queryKey: ['withdrawals'] }),
  });
  function close() {
    setAction(null);
    setText('');
    run.reset();
  }

  const t = text.trim();
  const textValid =
    action?.kind === 'reject'
      ? t.length >= REJECT_REASON_MIN && t.length <= REJECT_REASON_MAX
      : action?.kind === 'pay'
        ? t.length >= 1 && t.length <= REFERENCE_MAX
        : true;

  return (
    <>
      <h1>משיכות</h1>
      <div className="row">
        <label>
          סטטוס
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as WithdrawalStatus);
              setPage(1);
            }}
          >
            {WITHDRAWAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {WITHDRAWAL_STATUS_LABEL[s]}
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
                    <th>סכום</th>
                    <th>עמלה</th>
                    <th>לתשלום</th>
                    <th>אמצעי</th>
                    <th>סטטוס</th>
                    <th>הערות</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((w) => (
                    <tr key={w.id}>
                      <td>{formatDate(w.createdAt)}</td>
                      <td>
                        <RequesterLink userId={w.userId} user={w.user} />
                      </td>
                      <td>{formatNis(w.amount)}</td>
                      <td>{formatNis(w.fee)}</td>
                      <td>{formatNis(w.payout)}</td>
                      <td>
                        {WITHDRAWAL_METHOD_LABEL[w.method] ?? w.method}
                        {w.bankAccountLast4 && <span className="ltr"> ••{w.bankAccountLast4}</span>}
                      </td>
                      <td>
                        <Badge tone={WITHDRAWAL_STATUS_TONE[w.status] ?? 'gray'}>
                          {WITHDRAWAL_STATUS_LABEL[w.status] ?? w.status}
                        </Badge>
                      </td>
                      <td>{notes(w)}</td>
                      <td>
                        <div className="row">
                          {canApprove(w) && <button onClick={() => setAction({ kind: 'approve', w })}>אשר</button>}
                          {canMarkPaid(w) && <button onClick={() => setAction({ kind: 'pay', w })}>סמן כשולמה</button>}
                          {canReject(w) && (
                            <button className="danger" onClick={() => setAction({ kind: 'reject', w })}>
                              דחה
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {(total > pageSize || page > 1) && <Pager page={page} pageSize={pageSize} total={total} onPage={setPage} />}
          </>
        )}
      </QueryState>

      {action && (
        <ConfirmDialog
          title={TITLE[action.kind]}
          confirmLabel={TITLE[action.kind]}
          danger={action.kind === 'reject'}
          confirmDisabled={!textValid}
          busy={run.isPending}
          error={run.isError ? errorText(run.error) : null}
          onConfirm={() => run.mutate({ ...action, text })}
          onCancel={close}
        >
          <p>
            משיכה של <strong>{formatNis(action.w.amount)}</strong> (
            {WITHDRAWAL_METHOD_LABEL[action.w.method] ?? action.w.method}) · לתשלום ללקוח:{' '}
            <strong>{formatNis(action.w.payout)}</strong>
          </p>
          {action.kind === 'approve' && action.w.method === 'card' && (
            <p className="muted">אישור משיכה לכרטיס מבצע את הזיכוי מיד.</p>
          )}
          {action.kind === 'reject' && <p className="muted">הסכום יוחזר לארנק של הלקוח.</p>}
          {action.w.method === 'bank' && <BankDetailsReveal withdrawalId={action.w.id} />}
          {action.kind === 'reject' && (
            <label>
              סיבת הדחייה
              <input value={text} onChange={(e) => setText(e.target.value)} maxLength={REJECT_REASON_MAX} autoFocus />
            </label>
          )}
          {action.kind === 'pay' && (
            <label>
              אסמכתת ההעברה הבנקאית
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={REFERENCE_MAX}
                dir="ltr"
                autoFocus
              />
            </label>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
