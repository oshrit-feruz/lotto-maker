import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './Dialog';

function Harness({ busy = false, onCancel = () => {} }: { busy?: boolean; onCancel?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>פתח</button>
      {open && (
        <ConfirmDialog
          title="כותרת"
          confirmLabel="אישור"
          busy={busy}
          onConfirm={() => setOpen(false)}
          onCancel={() => {
            onCancel();
            setOpen(false);
          }}
        >
          <input aria-label="שדה" />
        </ConfirmDialog>
      )}
    </>
  );
}

describe('ConfirmDialog focus handling', () => {
  it('moves focus in on open, traps Tab, and restores focus on close', async () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'פתח' });
    await userEvent.click(opener);
    expect(screen.getByRole('dialog', { name: 'כותרת' })).toBeInTheDocument();
    const field = screen.getByLabelText('שדה');
    const cancel = screen.getByRole('button', { name: 'ביטול' });
    const ok = screen.getByRole('button', { name: 'אישור' });
    expect(field).toHaveFocus();

    await userEvent.tab();
    expect(cancel).toHaveFocus();
    await userEvent.tab();
    expect(ok).toHaveFocus();
    await userEvent.tab();
    expect(field).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(ok).toHaveFocus();

    await userEvent.click(ok);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('keeps an autoFocus child focused and still restores the opener', async () => {
    function AutoFocus() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>פתח</button>
          {open && (
            <ConfirmDialog title="t" confirmLabel="אישור" onConfirm={() => {}} onCancel={() => setOpen(false)}>
              <button>ראשון</button>
              <input aria-label="מוקד" autoFocus />
            </ConfirmDialog>
          )}
        </>
      );
    }
    render(<AutoFocus />);
    await userEvent.click(screen.getByRole('button', { name: 'פתח' }));
    expect(screen.getByLabelText('מוקד')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'פתח' })).toHaveFocus();
  });

  it('closes on Escape, but not while busy', async () => {
    const onCancel = vi.fn();
    const { rerender } = render(<Harness busy onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'פתח' }));
    await userEvent.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    rerender(<Harness onCancel={onCancel} />);
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
