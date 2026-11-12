import type { ReactNode } from 'react';

/** Modal confirmation dialog. `confirmDisabled` lets callers gate the action (e.g. a typed check). */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  confirmDisabled = false,
  busy = false,
  error = null,
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  confirmDisabled?: boolean;
  busy?: boolean;
  error?: string | null;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row end">
          <button className="secondary" onClick={onCancel} disabled={busy}>
            ביטול
          </button>
          <button className={danger ? 'danger' : ''} onClick={onConfirm} disabled={confirmDisabled || busy}>
            {busy ? 'רגע…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
