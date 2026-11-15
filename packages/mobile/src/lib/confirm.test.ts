import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const rn = vi.hoisted(() => ({
  Platform: { OS: 'web' as string },
  Alert: { alert: vi.fn() },
}));
vi.mock('react-native', () => rn);

import { notify, confirmAction } from './confirm.js';

describe('confirm wrapper on web', () => {
  const alert = vi.fn();
  const confirm = vi.fn();

  beforeEach(() => {
    rn.Platform.OS = 'web';
    rn.Alert.alert.mockReset();
    alert.mockReset();
    confirm.mockReset();
    vi.stubGlobal('window', { alert, confirm });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('notify shows title and message with window.alert, then calls onDismiss', () => {
    const onDismiss = vi.fn();
    notify('האימות בבדיקה', 'ממתין לאישור', { okText: 'המשך', onDismiss });
    expect(alert).toHaveBeenCalledWith('האימות בבדיקה\n\nממתין לאישור');
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(rn.Alert.alert).not.toHaveBeenCalled();
  });

  it('notify without a message shows only the title', () => {
    notify('שגיאה');
    expect(alert).toHaveBeenCalledWith('שגיאה');
  });

  it('confirmAction calls onConfirm when the user agrees', () => {
    confirm.mockReturnValue(true);
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    confirmAction({ title: 'ביטול מנוי', message: 'האם לבטל?', confirmText: 'כן', cancelText: 'לא', onConfirm, onCancel });
    expect(confirm).toHaveBeenCalledWith('ביטול מנוי\n\nהאם לבטל?');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('confirmAction calls onCancel when the user declines', () => {
    confirm.mockReturnValue(false);
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    confirmAction({ title: 'ביטול מנוי', confirmText: 'כן', cancelText: 'לא', onConfirm, onCancel });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('confirm wrapper on native', () => {
  beforeEach(() => {
    rn.Platform.OS = 'ios';
    rn.Alert.alert.mockReset();
  });

  it('notify without callbacks keeps the plain Alert.alert call', () => {
    notify('שגיאה', 'נסה שנית');
    expect(rn.Alert.alert).toHaveBeenCalledWith('שגיאה', 'נסה שנית');
  });

  it('confirmAction passes cancel and confirm buttons to Alert.alert', () => {
    const onConfirm = vi.fn();
    confirmAction({ title: 't', confirmText: 'כן', cancelText: 'לא', destructive: true, onConfirm });
    const buttons = rn.Alert.alert.mock.calls[0]![2] as Array<{ text: string; style?: string; onPress?: () => void }>;
    expect(buttons.map((b) => [b.text, b.style])).toEqual([['לא', undefined], ['כן', 'destructive']]);
    buttons[1]!.onPress!();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
