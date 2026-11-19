import type { ReactNode } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { colors, radii, rtl, spacing, type } from '../../theme/index.js';

type Tone = 'warn' | 'error' | 'ok' | 'info';

const TONES: Record<Tone, { bg: string; line: string; strip: string; ink: string }> = {
  warn: { bg: colors.sunSoft, line: colors.warnLine, strip: colors.sunDeep, ink: colors.warnInk },
  error: { bg: colors.dangerSoft, line: colors.errorLine, strip: colors.danger, ink: colors.dangerInk },
  ok: { bg: colors.okSoft, line: colors.okLine, strip: colors.ok, ink: colors.okInk },
  info: { bg: colors.skySoft, line: colors.sky, strip: colors.skyDeep, ink: colors.ink },
};

/** An inline message with a coloured strip on its start edge. */
export function Notice({ tone, children, style }: Readonly<{ tone: Tone; children: ReactNode; style?: StyleProp<ViewStyle> }>) {
  const t = TONES[tone];
  return (
    <View
      style={[styles.notice, { backgroundColor: t.bg, borderColor: t.line }, style]}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
    >
      <View style={[styles.strip, { backgroundColor: t.strip }]} />
      <View style={styles.noticeBody}>
        {typeof children === 'string' ? (
          <Text style={[type.small, { color: t.ink, textAlign: rtl.textStart }]}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

/** Nothing here yet: a dashed empty ball and one line of direction. */
export function EmptyState({ text, children }: Readonly<{ text: string; children?: ReactNode }>) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyRing} />
      <Text style={styles.emptyText}>{text}</Text>
      {children}
    </View>
  );
}

export function Loading({ label }: Readonly<{ label?: string }>) {
  return (
    <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={label ?? 'טוען'}>
      <ActivityIndicator size="large" color={colors.pine} />
      {label ? <Text style={[type.small, { marginTop: spacing.sm }]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: rtl.row,
    borderRadius: radii.sm,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  strip: { width: 5 },
  noticeBody: { flex: 1, paddingVertical: 12, paddingHorizontal: 14 },
  empty: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.line,
    borderRadius: radii.md,
    marginTop: spacing.sm,
  },
  emptyRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderStyle: 'dashed',
    borderColor: colors.emptyRing,
    marginBottom: 12,
  },
  emptyText: { ...type.body, fontSize: 17, color: colors.muted, textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper, padding: 24 },
});
