/**
 * Focus handling for modal dialogs, shared by the website and the admin dashboard.
 *
 * Done by hand rather than with `<dialog>.showModal()` because jsdom (used by the admin tests)
 * does not implement showModal. Framework-free, so each app keeps its own markup and styles.
 * Exported as `@lotto-maker/shared/dom`, not from the package index: the backend has no DOM.
 */

export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const focusablesIn = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

/**
 * The index Tab (or Shift+Tab when `backwards`) moves to among `count` focusable elements, from
 * `current` (-1 when focus is not on one of them). Wraps around at both ends.
 */
export function nextFocusIndex(count: number, current: number, backwards: boolean): number {
  if (backwards) return current <= 0 ? count - 1 : current - 1;
  return current === -1 || current === count - 1 ? 0 : current + 1;
}

export interface FocusTrapOptions {
  /** Escape was pressed. Return false to ignore it (e.g. while a request is running). */
  onEscape: () => boolean;
  /** Focused again when the trap is released, if still in the page (usually the trigger). */
  returnFocusTo: HTMLElement | null;
}

/**
 * Moves focus into `dialog` (unless an element inside already has it, e.g. an `autoFocus` field),
 * keeps Tab and Shift+Tab inside it, pulls focus back if it lands outside, and reports Escape.
 * Returns the function that releases the trap and restores focus.
 */
export function trapFocus(dialog: HTMLElement, { onEscape, returnFocusTo }: FocusTrapOptions): () => void {
  const focusFirst = () => (focusablesIn(dialog)[0] ?? dialog).focus();
  if (!dialog.contains(document.activeElement)) focusFirst();

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (onEscape()) e.preventDefault();
      return;
    }
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const items = focusablesIn(dialog);
    if (items.length === 0) {
      dialog.focus();
      return;
    }
    const current = items.indexOf(document.activeElement as HTMLElement);
    items[nextFocusIndex(items.length, current, e.shiftKey)]?.focus();
  };
  // A click on the page behind the backdrop must not leave focus outside the dialog.
  const onFocusIn = (e: FocusEvent) => {
    if (e.target instanceof Node && !dialog.contains(e.target)) focusFirst();
  };

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('focusin', onFocusIn);
  return () => {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('focusin', onFocusIn);
    if (returnFocusTo?.isConnected) returnFocusTo.focus();
  };
}
