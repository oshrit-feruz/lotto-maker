import { Text, StyleSheet } from 'react-native';
import { colors, rtl, type } from '../../theme/index.js';
import { Notice } from './Feedback.js';
import { Button } from './Button.js';

/** A failed load: the error notice with a retry button. */
export function LoadError({ message, onRetry }: Readonly<{ message: string; onRetry: () => void }>) {
  return (
    <Notice tone="error">
      <Text style={styles.text}>{message}</Text>
      <Button label="נסה שוב" onPress={onRetry} variant="ghost" size="sm" style={styles.retry} />
    </Notice>
  );
}

const styles = StyleSheet.create({
  text: { ...type.small, color: colors.dangerInk, textAlign: rtl.textStart },
  retry: { alignSelf: rtl.alignStart, marginTop: 10 },
});
