'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { trapFocus } from '@lotto-maker/shared/dom';

export interface ConfirmDialogProps {
  /** The question, e.g. "להסיר את הכרטיס?". Names the dialog for screen readers. */
  title: string;
  /** What will happen; describes the dialog. */
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive action: the confirm button is solid red. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * In-app confirmation (instead of `window.confirm`), rendered only while open.
 *
 * Modal: a backdrop over the page, focus moves to the first button (cancel, the safe choice),
 * Tab stays inside, Escape cancels, and on close focus returns to the
 * button that opened it. The focus handling is shared with the admin dashboard
 * (`@lotto-maker/shared/dom`). Direction comes from the page (`dir="rtl"`).
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = 'ביטול',
  danger = false,
  onConfirm,
  onCancel,
}: Readonly<ConfirmDialogProps>) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();
  // The document listener is registered once; it calls whatever onCancel is current.
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  // The trigger still has focus during the first render.
  const [trigger] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));

  useEffect(() => {
    const cancelOnEscape = () => {
      cancelRef.current();
      return true;
    };
    return trapFocus(ref.current!, { onEscape: cancelOnEscape, returnFocusTo: trigger });
  }, [trigger]);

  return createPortal(
    <div className="modal-backdrop">
      <dialog
        open
        ref={ref}
        className="modal"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={children ? bodyId : undefined}
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        {children ? <div id={bodyId}>{children}</div> : null}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={danger ? 'btn btn-danger' : 'btn'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </div>,
    document.body,
  );
}
