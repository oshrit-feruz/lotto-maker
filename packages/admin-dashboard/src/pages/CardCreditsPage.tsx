import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listCardCredits, markCardCreditPaid } from '../api/payouts';
import type { CardCredit, CardCreditStatus } from '../api/types';
import { ConfirmDialog } from '../components/Dialog';
import { Badge, Empty, QueryState } from '../components/ui';
import { formatDate, formatNis } from '../lib/format';

export default function CardCreditsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<CardCreditStatus>('pending');
  const [target, setTarget] = useState<CardCredit | null>(null);
  const q = useQuery({ queryKey: ['card-credits', status], queryFn: () => listCardCredits(status) });
  const pay = useMutation({
    mutationFn: (id: string) => markCardCreditPaid(id),
    onSuccess: () => {
      setTarget(null);
      void qc.invalidateQueries({ queryKey: ['card-credits'] });
    },
  });

  return (
    <>
      <h1>זיכויי כרטיס</h1>
      <div className="row">
        <label>
          סטטוס
          <select value={status} onChange={(e) => setStatus(e.target.value as CardCreditStatus)}>
            <option value="pending">ממתין</option>
            <option value="paid">שולם</option>
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
                  <th>סטטוס</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td>{formatDate(c.createdAt)}</td>
                    <td className="ltr">{c.user?.phone ?? c.userId.slice(-8)}</td>
                    <td className="ltr">{c.orderId.slice(-8)}</td>
                    <td>{formatNis(c.amount)}</td>
                    <td>
                      <Badge tone={c.status === 'paid' ? 'green' : 'amber'}>{c.status === 'paid' ? 'שולם' : 'ממתין'}</Badge>
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
          busy={pay.isPending}
          error={pay.isError ? (pay.error as Error).message : null}
          onConfirm={() => pay.mutate(target.id)}
          onCancel={() => {
            pay.reset();
            setTarget(null);
          }}
        >
          <p>
            זיכוי כרטיס בסך <strong>{formatNis(target.amount)}</strong> יסומן כשולם. לא ניתן לבטל.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
