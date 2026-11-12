import { useState } from 'react';
import type { PrizeClaim } from '../api/types';
import { formatNis } from '../lib/format';
import { isIdLast4Valid } from '../lib/idCheck';
import { ConfirmDialog } from './Dialog';

/** Collecting a prize requires typing the claimant's ID last 4 digits. */
export default function CollectClaimDialog({
  claim,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  claim: Pick<PrizeClaim, 'amount' | 'claimantIdLast4' | 'claimantPhone'>;
  busy?: boolean;
  error?: string | null;
  onConfirm: (idLast4: string) => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  const valid = isIdLast4Valid(typed, claim.claimantIdLast4);
  const mismatch = typed.length === 4 && !valid;
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
        {claim.claimantPhone && <span className="ltr"> · {claim.claimantPhone}</span>}
      </p>
      <label>
        4 ספרות אחרונות של תעודת הזהות
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          maxLength={4}
          dir="ltr"
          autoFocus
        />
      </label>
      {mismatch && (
        <p className="error" role="alert">
          הספרות אינן תואמות
        </p>
      )}
    </ConfirmDialog>
  );
}
