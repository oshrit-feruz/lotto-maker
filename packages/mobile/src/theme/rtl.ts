import { I18nManager, Platform } from 'react-native';
import type { FlexStyle, TextStyle } from 'react-native';

/**
 * The app is Hebrew and reads right to left on every platform.
 *
 * On the web the document is set to dir="rtl", so a plain 'row' already runs
 * right to left. On iOS and Android the layout direction follows the device
 * (I18nManager.isRTL), and React Native swaps 'left'/'right' text alignment
 * when it is RTL. These helpers give the same visual result in every case
 * without forcing RTL (which only takes effect after an app restart).
 */
const flipped = Platform.OS === 'web' || I18nManager.isRTL;

export const rtl = {
  /** Children run right to left (Hebrew reading order). */
  row: (flipped ? 'row' : 'row-reverse') as FlexStyle['flexDirection'],
  /** Children run left to right (number balls, digits). */
  ltrRow: (flipped ? 'row-reverse' : 'row') as FlexStyle['flexDirection'],
  /** Visually right-aligned text (the start of a Hebrew line). */
  textStart: (Platform.OS !== 'web' && I18nManager.isRTL ? 'left' : 'right') as TextStyle['textAlign'],
  /** Visually left-aligned text (the end of a Hebrew line). */
  textEnd: (Platform.OS !== 'web' && I18nManager.isRTL ? 'right' : 'left') as TextStyle['textAlign'],
  /** Cross-axis alignment of a column's children to the visual right. */
  /**
   * The style key that positions from the visual left. React Native treats
   * 'left' as the start edge when the device is RTL.
   */
  physicalLeft: (Platform.OS !== 'web' && I18nManager.isRTL ? 'right' : 'left') as 'left' | 'right',
  physicalRight: (Platform.OS !== 'web' && I18nManager.isRTL ? 'left' : 'right') as 'left' | 'right',
  alignStart: (flipped ? 'flex-start' : 'flex-end') as FlexStyle['alignItems'],
  alignEnd: (flipped ? 'flex-end' : 'flex-start') as FlexStyle['alignItems'],
};

/** On the web, mark the document as Hebrew RTL so text and flex rows follow it. */
export function applyDocumentDirection() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  document.documentElement.setAttribute('dir', 'rtl');
  document.documentElement.setAttribute('lang', 'he');
  document.body.style.backgroundColor = '#f0f5f1';
}
