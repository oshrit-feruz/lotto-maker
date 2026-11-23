'use client';

import { useEffect, useRef } from 'react';
import type { Me } from '@/lib/types';
import { OtpForm } from '../auth/OtpForm';

/**
 * Login on top of the ticket form, so a logged-out visitor keeps the filled ticket and goes
 * straight on to payment. A native modal <dialog>: focus stays inside and Escape closes it.
 */
export function LoginDialog({
  open,
  onClose,
  onVerified,
}: Readonly<{ open: boolean; onClose: () => void; onVerified: (me: Me) => void }>) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="login-dialog" aria-labelledby="login-dialog-title" onClose={onClose}>
      <div className="spread" style={{ marginBottom: 8 }}>
        <h2 id="login-dialog-title" style={{ margin: 0 }}>
          התחברות לשליחת הטופס
        </h2>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="סגירה">
          ✕
        </button>
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>
        הטופס שמילאתם נשמר. אחרי האימות ממשיכים ישר לתשלום.
      </p>
      {open ? <OtpForm onVerified={onVerified} /> : null}
    </dialog>
  );
}
