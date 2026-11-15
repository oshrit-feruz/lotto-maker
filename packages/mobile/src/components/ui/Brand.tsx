import type { ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BallFace } from './Ball.js';
import { colors, fonts, rtl, spacing, type } from '../../theme/index.js';
import { BRAND_NAME } from '../../config.js';

/** Two overlapping balls, sun and plum: the brand mark. */
export function BrandMark({ size = 22, ring = colors.pine }: { size?: number; ring?: string }) {
  return (
    <View style={{ width: size * 1.45, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ position: 'absolute', top: 0, [rtl.physicalLeft]: 0 }}>
        <BallFace size={size} tone="sun" />
      </View>
      <View
        style={{
          position: 'absolute', top: -2, [rtl.physicalLeft]: size * 0.45 - 2,
          borderRadius: size, borderWidth: 2, borderColor: ring,
        }}
      >
        <BallFace size={size} tone="plum" />
      </View>
    </View>
  );
}

/** The pine app bar, under the status bar. */
export function AppHeader({ end }: { end?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.brand} accessibilityRole="header">
        <BrandMark />
        <Text style={styles.brandText}>{BRAND_NAME}</Text>
      </View>
      {end}
    </View>
  );
}

/** A screen title in the display face, with an optional line under it. */
export function ScreenTitle({ title, subtitle, end, style }: { title: string; subtitle?: string; end?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.titleWrap, style]}>
      <View style={styles.titleRow}>
        <Text style={[type.h1, styles.title]} accessibilityRole="header">{title}</Text>
        {end}
      </View>
      {subtitle ? <Text style={[type.small, { textAlign: rtl.textStart }]}>{subtitle}</Text> : null}
    </View>
  );
}

/**
 * A shekel amount in the display face. Secular One draws ₪ as two letters,
 * so the sign alone is set in Rubik (the web does the same with unicode-range).
 */
export function Amount({ value, style }: { value: string; style?: StyleProp<TextStyle> }) {
  const parts = value.split('₪');
  return (
    <Text style={[styles.amount, style]}>
      {parts.map((p, i) => (
        <Text key={i}>
          {i > 0 ? <Text style={styles.shekel}>₪</Text> : null}
          {p}
        </Text>
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.pine,
    paddingHorizontal: spacing.lg,
    paddingBottom: 10,
    flexDirection: rtl.row,
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
  },
  brand: { flexDirection: rtl.row, alignItems: 'center', gap: 10 },
  brandText: { fontFamily: fonts.display, fontSize: 21, lineHeight: 26, color: colors.brandInk },
  titleWrap: { marginBottom: spacing.lg },
  titleRow: { flexDirection: rtl.row, alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { textAlign: rtl.textStart, flexShrink: 1 },
  amount: { fontFamily: fonts.display, color: colors.pineDeep, fontVariant: ['tabular-nums'] },
  shekel: { fontFamily: fonts.bodyBold },
});
