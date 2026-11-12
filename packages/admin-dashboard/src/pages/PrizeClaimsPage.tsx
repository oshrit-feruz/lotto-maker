import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { collectClaim, listClaims, scheduleClaim } from '../api/claims';
import type { ClaimStatus, PrizeClaim } from '../api/types';
import CollectClaimDialog from '../components/CollectClaimDialog';
import { ConfirmDialog } from '../components/Dialog';
import { Badge, Empty, QueryState } from '../components/ui';
import { formatDate, formatNis, jerusalemDayToIso } from '../lib/format';

const STATUS_LABEL: Record<ClaimStatus, string> = {
  awaiting_pickup: 'ממתין לאיסוף',
  scheduled: 'נקבע מועד',
  collected: 'נאסף',
  expired: 'פג תוקף',
};

export default function PrizeClaimsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<ClaimStatus>('awaiting_pickup');
  const [collecting, setCollecting] = useState<PrizeClaim | null>(null);
  const [scheduling, setScheduling] = useState<PrizeClaim | null>(null);
  const [day, setDay] = useState('');
  const q = useQuery({ queryKey: ['claims', status], queryFn: () => listClaims(status) });

  const onDone = () => {
    setCollecting(null);
    setScheduling(null);
    void qc.invalidateQueries({ queryKey: ['claims'] });
  };
  const collect = useMutation({ mutationFn: (v: { id: string; last4: string }) => collectClaim(v.id, v.last4), onSuccess: onDone });
  const schedule = useMutation({
    mutationFn: (v: { id: string; iso: string }) => scheduleClaim(v.id, v.iso),
    onSuccess: () => {
      setDay('');
      onDone();
    },
  });

  return (
    <>
      <h1>זכיות לאיסוף</h1>
      <div className="row">
        <label>
          סטטוס
          <select value={status} onChange={(e) => setStatus(e.target.value as ClaimStatus)}>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <QueryState q={q}>
        {(claims) =>
          claims.length === 0 ? (
            <Empty />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>הזמנה</th>
                  <th>הגרלה</th>
                  <th>סכום</th>
                  <th>נוצר</th>
                  <th>מועד איסוף</th>
                  <th>סטטוס</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c.id}>
                    <td className="ltr">{c.orderId.slice(-8)}</td>
                    <td>{c.order?.draw?.drawNumber ?? '—'}</td>
                    <td>{formatNis(c.amount)}</td>
                    <td>{formatDate(c.createdAt)}</td>
                    <td>{formatDate(c.scheduledFor)}</td>
                    <td>
                      <Badge tone={c.status === 'collected' ? 'green' : c.status === 'expired' ? 'red' : 'amber'}>{STATUS_LABEL[c.status]}</Badge>
                    </td>
                    <td>
                      {(c.status === 'awaiting_pickup' || c.status === 'scheduled') && (
                        <div className="row">
                          <button className="secondary" onClick={() => setScheduling(c)}>
                            קבע מועד
                          </button>
                          <button onClick={() => setCollecting(c)}>מסור</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </QueryState>

      {collecting && (
        <CollectClaimDialog
          claim={collecting}
          busy={collect.isPending}
          error={collect.isError ? (collect.error as Error).message : null}
          onConfirm={(last4) => collect.mutate({ id: collecting.id, last4 })}
          onCancel={() => {
            collect.reset();
            setCollecting(null);
          }}
        />
      )}
      {scheduling && (
        <ConfirmDialog
          title="קביעת מועד איסוף"
          confirmLabel="קבע"
          confirmDisabled={!day}
          busy={schedule.isPending}
          error={schedule.isError ? (schedule.error as Error).message : null}
          onConfirm={() => schedule.mutate({ id: scheduling.id, iso: jerusalemDayToIso(day) })}
          onCancel={() => {
            schedule.reset();
            setScheduling(null);
          }}
        >
          <p>סכום: {formatNis(scheduling.amount)}</p>
          <label>
            תאריך
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
        </ConfirmDialog>
      )}
    </>
  );
}
