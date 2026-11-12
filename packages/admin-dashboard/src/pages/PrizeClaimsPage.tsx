import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { collectClaim, listClaims, scheduleClaim } from '../api/claims';
import { ApiError } from '../api/client';
import { errorText } from '../api/errors';
import type { ClaimStatus, PrizeClaim } from '../api/types';
import CollectClaimDialog from '../components/CollectClaimDialog';
import { ConfirmDialog } from '../components/Dialog';
import { Badge, Empty, QueryState } from '../components/ui';
import { formatDate, formatNis, jerusalemLocalToIso, toJerusalemLocalInput } from '../lib/format';

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  awaiting_pickup: 'ממתין לאיסוף',
  scheduled: 'נקבע מועד',
  collected: 'נאסף',
  expired: 'פג תוקף',
};

/** Errors after which the claim's state on the server differs from the list: reload it. */
const STALE_CLAIM_CODES = new Set(['CLAIM_ALREADY_COLLECTED', 'CLAIM_EXPIRED', 'CLAIM_NOT_OPEN', 'CLAIM_NOT_FOUND']);

/** Validates a picked slot (Jerusalem wall time) against now and the claim's expiry. */
export function slotError(local: string, expiresAt: string, now = new Date()): string | null {
  const iso = jerusalemLocalToIso(local);
  if (!iso) return 'יש לבחור תאריך ושעה';
  const t = new Date(iso).getTime();
  if (t <= now.getTime()) return 'המועד חייב להיות בעתיד';
  if (t > new Date(expiresAt).getTime()) return 'המועד חייב להיות לפני תום תוקף הזכייה';
  return null;
}

export default function PrizeClaimsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<ClaimStatus>('awaiting_pickup');
  const [collecting, setCollecting] = useState<PrizeClaim | null>(null);
  const [scheduling, setScheduling] = useState<PrizeClaim | null>(null);
  const [slot, setSlot] = useState('');
  const q = useQuery({ queryKey: ['claims', status], queryFn: () => listClaims(status) });

  const reload = () => void qc.invalidateQueries({ queryKey: ['claims'] });
  const onStaleError = (err: unknown) => {
    if (err instanceof ApiError && STALE_CLAIM_CODES.has(err.code)) reload();
  };
  const collect = useMutation({
    mutationFn: (v: { id: string; last4: string }) => collectClaim(v.id, v.last4),
    onSuccess: () => {
      setCollecting(null);
      reload();
    },
    onError: onStaleError,
  });
  const schedule = useMutation({
    mutationFn: (v: { id: string; iso: string }) => scheduleClaim(v.id, v.iso),
    onSuccess: () => {
      setScheduling(null);
      setSlot('');
      reload();
    },
    onError: onStaleError,
  });

  const slotProblem = scheduling && slot ? slotError(slot, scheduling.expiresAt) : null;

  return (
    <>
      <h1>זכיות לאיסוף</h1>
      <div className="row">
        <label>
          סטטוס
          <select value={status} onChange={(e) => setStatus(e.target.value as ClaimStatus)}>
            {Object.entries(CLAIM_STATUS_LABEL).map(([k, v]) => (
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
                  <th>זוכה</th>
                  <th>טלפון</th>
                  <th>הגרלה</th>
                  <th>סכום</th>
                  <th>נוצר</th>
                  <th>מועד איסוף</th>
                  <th>בתוקף עד</th>
                  <th>סטטוס</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c.id}>
                    <td>{c.claimantName ?? '—'}</td>
                    <td className="ltr">{c.claimantPhone}</td>
                    <td>{c.drawNumber ?? '—'}</td>
                    <td>{formatNis(c.amount)}</td>
                    <td>{formatDate(c.createdAt)}</td>
                    <td>{formatDate(c.scheduledFor)}</td>
                    <td>{formatDate(c.expiresAt)}</td>
                    <td>
                      <Badge tone={c.status === 'collected' ? 'green' : c.status === 'expired' ? 'red' : 'amber'}>
                        {CLAIM_STATUS_LABEL[c.status]}
                      </Badge>
                    </td>
                    <td>
                      {(c.status === 'awaiting_pickup' || c.status === 'scheduled') && (
                        <div className="row">
                          <button
                            className="secondary"
                            onClick={() => {
                              setSlot(c.scheduledFor ? toJerusalemLocalInput(c.scheduledFor) : '');
                              setScheduling(c);
                            }}
                          >
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
          error={collect.isError ? errorText(collect.error) : null}
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
          confirmDisabled={!slot || slotProblem !== null}
          busy={schedule.isPending}
          error={schedule.isError ? errorText(schedule.error) : slotProblem}
          onConfirm={() => {
            const iso = jerusalemLocalToIso(slot);
            if (iso) schedule.mutate({ id: scheduling.id, iso });
          }}
          onCancel={() => {
            schedule.reset();
            setScheduling(null);
            setSlot('');
          }}
        >
          <p>
            סכום: {formatNis(scheduling.amount)} · בתוקף עד {formatDate(scheduling.expiresAt)}
          </p>
          <label>
            תאריך ושעה (שעון ישראל)
            <input
              type="datetime-local"
              value={slot}
              min={toJerusalemLocalInput(new Date())}
              max={toJerusalemLocalInput(scheduling.expiresAt)}
              onChange={(e) => {
                schedule.reset();
                setSlot(e.target.value);
              }}
            />
          </label>
        </ConfirmDialog>
      )}
    </>
  );
}
