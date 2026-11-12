import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const focusables = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));

/**
 * Modal confirmation dialog. `confirmDisabled` lets callers gate the action (e.g. a typed check).
 *
 * Focus handling is done by hand rather than with `<dialog>.showModal()` because jsdom (used by the
 * tests) does not implement showModal. On open, focus moves into the dialog (an `autoFocus` child
 * wins, otherwise the first focusable element); Tab and Shift+Tab cycle inside it; Escape cancels
 * unless busy; on close, focus returns to the element that had it before.
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
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Latest values for the document listener, which is registered once.
  const latest = useRef({ busy, onCancel });
  latest.current = { busy, onCancel };
  // Captured during the first render: by the time effects run, an `autoFocus` child has focus.
  const [previous] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));

  useEffect(() => {
    const dialog = ref.current!;
    if (!dialog.contains(document.activeElement)) (focusables(dialog)[0] ?? dialog).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!latest.current.busy) {
          e.preventDefault();
          latest.current.onCancel();
        }
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables(dialog);
      e.preventDefault();
      if (items.length === 0) return dialog.focus();
      const i = items.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : i === -1 || i === items.length - 1 ? 0 : i + 1;
      items[next]!.focus();
    };
    // Pull focus back if it lands outside (e.g. a click on the page behind the backdrop).
    const onFocusIn = (e: FocusEvent) => {
      if (e.target instanceof Node && !dialog.contains(e.target)) (focusables(dialog)[0] ?? dialog).focus();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
      if (previous?.isConnected) previous.focus();
    };
  }, [previous]);

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
