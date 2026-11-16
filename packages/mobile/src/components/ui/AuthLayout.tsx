import type { ReactNode } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BallFace } from './Ball.js';
import { BrandMark } from './Brand.js';
import { ResponsibleNotice } from './ResponsibleNotice.js';
import { colors, fonts, radii, rtl, shadows, spacing, type } from '../../theme/index.js';
import { BRAND_NAME } from '../../config.js';

/**
 * Sign-in and onboarding: a pine hero with the decorative balls, then the
 * step's form on a white sheet, then the 18+ and helpline panel.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
}: Readonly<{
  title: string;
  subtitle?: string;
  children: ReactNode;
}>) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.hero, { paddingTop: insets.top + 18 }]}>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <View style={[styles.deco, { top: -30, [rtl.physicalLeft]: -36 }]}><BallFace size={120} tone="sun" /></View>
            <View style={[styles.deco, { top: -18, [rtl.physicalLeft]: 72 }]}><BallFace size={60} tone="plum" /></View>
            <View style={[styles.deco, { top: 96, [rtl.physicalLeft]: 30 }]}><BallFace size={32} tone="white" /></View>
          </View>
          <View style={styles.brand}>
            <BrandMark />
            <Text style={styles.brandText}>{BRAND_NAME}</Text>
          </View>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>

        <View style={styles.sheet}>{children}</View>

        <View style={styles.footer}>
          <ResponsibleNotice />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.paper },
  scroll: { flexGrow: 1 },
  hero: {
    backgroundColor: colors.pine,
    paddingHorizontal: spacing.xl,
    paddingBottom: 56,
    overflow: 'hidden',
    borderBottomLeftRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
  },
  deco: { position: 'absolute' },
  brand: { flexDirection: rtl.row, alignItems: 'center', gap: 10, marginBottom: 28 },
  brandText: { fontFamily: fonts.display, fontSize: 21, lineHeight: 26, color: colors.brandInk },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 39,
    color: colors.brandInk,
    textAlign: rtl.textStart,
    maxWidth: 300,
    alignSelf: rtl.alignStart,
  },
  subtitle: { ...type.body, color: colors.onPineMuted, textAlign: rtl.textStart, marginTop: 8 },
  sheet: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: -36,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.xl,
    ...shadows.card,
  },
  footer: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
});
