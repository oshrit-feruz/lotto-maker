import { Alert, Platform } from 'react-native';

/*
 * Alert.alert is a no-op on react-native-web: no dialog appears and button
 * callbacks never run. These wrappers use the browser's own dialogs on web
 * and Alert.alert on native, so the callbacks run on both.
 */

interface NotifyOptions {
  /** Label of the single button (native only; the browser shows its own). */
  okText?: string;
  /** Runs once the user dismisses the message. */
  onDismiss?: () => void;
}

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText: string;
  cancelText: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

function browserText(title: string, message?: string): string {
  return message ? `${title}\n\n${message}` : title;
}

/** A message with a single button. */
export function notify(title: string, message?: string, options: NotifyOptions = {}): void {
  const { okText, onDismiss } = options;
  if (Platform.OS === 'web') {
    window.alert(browserText(title, message));
    onDismiss?.();
    return;
  }
  if (!okText && !onDismiss) {
    Alert.alert(title, message);
    return;
  }
  Alert.alert(title, message, [{ text: okText ?? 'אישור', onPress: onDismiss }]);
}

/** A yes/no question; onConfirm runs only when the user agrees. */
export function confirmAction(options: ConfirmOptions): void {
  const { title, message, confirmText, cancelText, destructive, onConfirm, onCancel } = options;
  if (Platform.OS === 'web') {
    if (window.confirm(browserText(title, message))) {
      void onConfirm();
    } else {
      onCancel?.();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: cancelText, onPress: onCancel },
    { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => { void onConfirm(); } },
  ]);
}
