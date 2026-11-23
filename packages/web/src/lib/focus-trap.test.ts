import { describe, expect, it } from 'vitest';
import { nextFocusIndex } from '@lotto-maker/shared/dom';

// The confirm dialog's Tab order (components/ConfirmDialog.tsx uses the shared focus trap).
describe('nextFocusIndex', () => {
  it('moves forward and wraps from the last element to the first', () => {
    expect(nextFocusIndex(2, 0, false)).toBe(1);
    expect(nextFocusIndex(2, 1, false)).toBe(0);
  });

  it('moves backward and wraps from the first element to the last', () => {
    expect(nextFocusIndex(2, 1, true)).toBe(0);
    expect(nextFocusIndex(2, 0, true)).toBe(1);
  });

  it('starts at an end when focus is outside the list', () => {
    expect(nextFocusIndex(3, -1, false)).toBe(0);
    expect(nextFocusIndex(3, -1, true)).toBe(2);
  });
});
