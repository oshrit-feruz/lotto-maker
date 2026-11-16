import { useState } from 'react';
import type { PrizeClaim } from '../api/types';
import { isIdLast4Format } from '../lib/idCheck';
import { formatPhoneLocal } from '../lib/phone';
import { Money } from './ui';
import { ConfirmDialog } from './Dialog';

/**
 * Hand-over of a prize against the claimant's ID card. The admin types the last 4 digits from the
 * physical card. The dashboard never receives the claimant's digits, so it only checks the format;
 * the server compares them and a mismatch comes back as 422 ID_MISMATCH (shown in Hebrew).
 */
export default function CollectClaimDialog({
  claim,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  claim: Pick<PrizeClaim, 'amount' | 'claimantPhone'> & Partial<Pick<PrizeClaim, 'claimantName' | 'drawNumber'>>;
  busy?: boolean;
  error?: string | null;
  onConfirm: (idLast4: string) => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  return (
    <ConfirmDialog
      title="מסירת זכייה"
      confirmLabel="סמן כנאסף"
      confirmDisabled={!isIdLast4Format(typed)}
      busy={busy ?? false}
      error={error ?? null}
      onConfirm={() => onConfirm(typed)}
      onCancel={onCancel}
    >
      <dl className="kv">
        <dt>סכום למסירה</dt>
        <dd>
          <strong>
            <Money value={claim.amount} />
          </strong>
        </dd>
        {claim.drawNumber != null && (
          <>
            <dt>הגרלה</dt>
            <dd>{claim.drawNumber}</dd>
          </>
        )}
        <dt>זוכה</dt>
        <dd>{claim.claimantName ?? '—'}</dd>
        <dt>טלפון</dt>
        <dd>
          <span className="ltr">{claim.claimantPhone ? formatPhoneLocal(claim.claimantPhone) : '—'}</span>
        </dd>
      </dl>
      <label>
        4 ספרות אחרונות של תעודת הזהות
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          dir="ltr"
          autoFocus
        />
      </label>
      <p className="muted">הקלד את הספרות מתעודת הזהות שהזוכה מציג. המערכת בודקת אותן מול הזוכה.</p>
    </ConfirmDialog>
  );
}
