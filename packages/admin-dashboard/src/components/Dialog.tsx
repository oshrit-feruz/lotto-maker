import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { trapFocus } from '../../../shared/src/dom/focus-trap';

/**
 * Modal confirmation dialog. `confirmDisabled` lets callers gate the action (e.g. a typed check).
 *
 * Focus handling (shared with the website, see shared/src/dom/focus-trap.ts): on open, focus moves
 * into the dialog (an `autoFocus` child wins, otherwise the first focusable element); Tab and
 * Shift+Tab cycle inside it; Escape cancels unless busy; on close, focus returns to the element
 * that had it before.
 */
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
}: Readonly<{
  title: string;
  children: ReactNode;
  confirmLabel: string;
  confirmDisabled?: boolean;
  busy?: boolean;
  error?: string | null;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}>) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Latest values for the document listener, which is registered once.
  const latest = useRef({ busy, onCancel });
  latest.current = { busy, onCancel };
  // Captured during the first render: by the time effects run, an `autoFocus` child has focus.
  const [previous] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));

  useEffect(
    () =>
      trapFocus(ref.current!, {
        onEscape: () => {
          if (latest.current.busy) return false;
          latest.current.onCancel();
          return true;
        },
        returnFocusTo: previous,
      }),
    [previous],
  );

  return (
    <div className="backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1}>
        <h2 id={titleId}>{title}</h2>
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
