import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { approveWithdrawal, listWithdrawals, markWithdrawalPaid, rejectWithdrawal } from '../api/payouts';
import type { Withdrawal, WithdrawalStatus } from '../api/types';
import { ConfirmDialog } from '../components/Dialog';
import { Badge, Empty, QueryState } from '../components/ui';
import { formatDate, formatNis } from '../lib/format';

const STATUS_LABEL: Record<WithdrawalStatus, string> = {
  pending: 'ממתינה',
  approved: 'אושרה',
  rejected: 'נדחתה',
  paid: 'שולמה',
};

type Action = { kind: 'approve' | 'reject' | 'pay'; w: Withdrawal };

export default function WithdrawalsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<WithdrawalStatus>('pending');
  const [action, setAction] = useState<Action | null>(null);
  const [text, setText] = useState('');
  const q = useQuery({ queryKey: ['withdrawals', status], queryFn: () => listWithdrawals(status) });

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
  });
  function close() {
    setAction(null);
    setText('');
    run.reset();
  }

  const needsText = action?.kind === 'reject' || action?.kind === 'pay';
  const title = action?.kind === 'approve' ? 'אישור משיכה' : action?.kind === 'reject' ? 'דחיית משיכה' : 'סימון כשולם';

  return (
    <>
      <h1>משיכות</h1>
      <div className="row">
        <label>
          סטטוס
          <select value={status} onChange={(e) => setStatus(e.target.value as WithdrawalStatus)}>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
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
                  <th>סכום</th>
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
                    <td className="ltr">{w.user?.phone ?? w.userId.slice(-8)}</td>
                    <td>{formatNis(w.amount)}</td>
                    <td>{w.method === 'bank' ? 'בנק' : (w.method ?? '—')}</td>
                    <td>
                      <Badge tone={w.status === 'paid' ? 'green' : w.status === 'rejected' ? 'red' : 'amber'}>{STATUS_LABEL[w.status]}</Badge>
                    </td>
                    <td>{w.rejectReason ?? w.reference ?? ''}</td>
                    <td>
                      <div className="row">
                        {w.status === 'pending' && (
                          <>
                            <button onClick={() => setAction({ kind: 'approve', w })}>אשר</button>
                            <button className="danger" onClick={() => setAction({ kind: 'reject', w })}>
                              דחה
                            </button>
                          </>
                        )}
                        {w.status === 'approved' && w.method === 'bank' && (
                          <button onClick={() => setAction({ kind: 'pay', w })}>סמן כשולם</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </QueryState>

      {action && (
        <ConfirmDialog
          title={title}
          confirmLabel={title}
          danger={action.kind === 'reject'}
          confirmDisabled={needsText && text.trim() === ''}
          busy={run.isPending}
          error={run.isError ? (run.error as Error).message : null}
          onConfirm={() => run.mutate({ ...action, text })}
          onCancel={close}
        >
          <p>
            משיכה של <strong>{formatNis(action.w.amount)}</strong>
            {action.w.user?.phone && <span className="ltr"> · {action.w.user.phone}</span>}
          </p>
          {needsText && (
            <label>
              {action.kind === 'reject' ? 'סיבת הדחייה' : 'אסמכתת העברה בנקאית'}
              <input value={text} onChange={(e) => setText(e.target.value)} autoFocus />
            </label>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
