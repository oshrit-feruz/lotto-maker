import { useState } from 'react';
import type { PrizeClaim } from '../api/types';
import { formatNis } from '../lib/format';
import { isIdLast4Valid } from '../lib/idCheck';
import { ConfirmDialog } from './Dialog';

/**
 * Hand-over of a prize against the claimant's ID card. The admin types the last 4 digits from the
 * physical card. The claimant's digits on file are never shown and never prefill the input; they
 * only enable the button, and the server checks the typed digits again (422 ID_MISMATCH).
 */
export default function CollectClaimDialog({
  claim,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  claim: Pick<PrizeClaim, 'amount' | 'claimantIdLast4' | 'claimantPhone'> &
    Partial<Pick<PrizeClaim, 'claimantName' | 'drawNumber'>>;
  busy?: boolean;
  error?: string | null;
  onConfirm: (idLast4: string) => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  const idKnown = !!claim.claimantIdLast4;
  const valid = isIdLast4Valid(typed, claim.claimantIdLast4);
  const mismatch = idKnown && typed.length === 4 && !valid;
  return (
    <ConfirmDialog
      title="מסירת זכייה"
      confirmLabel="סמן כנאסף"
      confirmDisabled={!valid}
      busy={busy ?? false}
      error={error ?? null}
      onConfirm={() => onConfirm(typed)}
      onCancel={onCancel}
    >
      <p>
        סכום למסירה: <strong>{formatNis(claim.amount)}</strong>
        {claim.drawNumber != null && <> · הגרלה {claim.drawNumber}</>}
      </p>
      <p>
        זוכה: {claim.claimantName ?? '—'}
        {claim.claimantPhone && <span className="ltr"> · {claim.claimantPhone}</span>}
      </p>
      {!idKnown && (
        <p className="error" role="alert">
          תעודת הזהות של הזוכה אינה זמינה במערכת – לא ניתן לאמת ולמסור את הזכייה.
        </p>
      )}
      <label>
        4 ספרות אחרונות של תעודת הזהות
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          dir="ltr"
          disabled={!idKnown}
          autoFocus
        />
      </label>
      <p className="muted">הקלד את הספרות מתעודת הזהות שהזוכה מציג.</p>
      {mismatch && (
        <p className="error" role="alert">
          הספרות אינן תואמות
        </p>
      )}
    </ConfirmDialog>
  );
}
