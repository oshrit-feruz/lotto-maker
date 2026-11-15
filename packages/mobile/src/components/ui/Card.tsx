import { useState } from 'react';
import type { ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { colors, radii, shadows, spacing } from '../../theme/index.js';

/** A white panel on the paper background. */
export function Card({ children, style }: Readonly<{ children: ReactNode; style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const STUB_PAD = 20;
const NOTCH = 13;

/**
 * The ticket stub: a card with a perforation (see <Perforation />). The shadow
 * sits on an outer view so the inner one can clip the notches to half circles.
 */
export function Stub({
  children,
  style,
  raised,
  bordered = true,
}: Readonly<{
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Lifted off a dark background (the home hero). */
  raised?: boolean;
  bordered?: boolean;
}>) {
  return (
    <View style={[styles.stubShadow, raised ? shadows.raised : shadows.card, style]}>
      <View style={[styles.stub, bordered && styles.stubBorder]}>{children}</View>
    </View>
  );
}

/**
 * The perforation across a stub: a dashed rule with a half-circle notch cut
 * from each side, filled with the colour behind the stub. Drawn with small
 * views because iOS cannot dash a single border side.
 */
export function Perforation({ notchColor = colors.paper, bordered = true }: Readonly<{ notchColor?: string; bordered?: boolean }>) {
  const [width, setWidth] = useState(0);
  const dashes = Math.max(0, Math.floor((width - NOTCH * 2 - 8) / 10));
  return (
    <View
      style={styles.perf}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.dashes}>
        {Array.from({ length: dashes }, (_, i) => <View key={i} style={styles.dash} />)}
      </View>
      <View style={[styles.notch, { left: -NOTCH, backgroundColor: notchColor }, bordered && styles.notchBorder]} />
      <View style={[styles.notch, { right: -NOTCH, backgroundColor: notchColor }, bordered && styles.notchBorder]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    padding: 18,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  stubShadow: { borderRadius: radii.md, backgroundColor: colors.surface, marginBottom: spacing.lg },
  stub: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: STUB_PAD,
    overflow: 'hidden',
  },
  stubBorder: { borderWidth: 1, borderColor: colors.line },
  perf: {
    height: NOTCH * 2,
    marginHorizontal: -STUB_PAD,
    marginVertical: 10,
    justifyContent: 'center',
  },
  dashes: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    overflow: 'hidden',
    marginHorizontal: NOTCH + 4,
  },
  dash: { width: 6, height: 2, borderRadius: 1, backgroundColor: colors.perforation },
  notch: {
    position: 'absolute',
    top: 0,
    width: NOTCH * 2,
    height: NOTCH * 2,
    borderRadius: NOTCH,
  },
  notchBorder: { borderWidth: 1, borderColor: colors.line },
});
