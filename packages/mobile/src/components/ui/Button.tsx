import type { ReactNode } from 'react';
import { Pressable, Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { colors, radii, rtl, type } from '../../theme/index.js';

type Variant = 'primary' | 'accent' | 'ghost' | 'danger' | 'onPine';
type Size = 'sm' | 'md' | 'lg';

const HEIGHT: Record<Size, number> = { sm: 44, md: 48, lg: 56 };
const PAD: Record<Size, number> = { sm: 16, md: 22, lg: 30 };
const FONT: Record<Size, number> = { sm: 15, md: 16, lg: 18 };

/**
 * The pill button. Primary is pine; accent is sun with a deeper sun lip under
 * it (the web's `box-shadow: 0 3px 0 var(--sun-deep)`); ghost is an outline.
 * Every size is at least 44pt tall.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  block,
  icon,
  style,
  accessibilityLabel,
}: Readonly<{
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  block?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}>) {
  const v = VARIANTS[variant];
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.base,
        { minHeight: HEIGHT[size], paddingHorizontal: PAD[size] },
        v.box,
        off && (variant === 'ghost' || variant === 'danger' ? styles.ghostDisabled : styles.disabled),
        block && styles.block,
        pressed && !off && [v.pressed, styles.pressed],
        style,
      ]}
    >
      <View style={styles.inner}>
        {loading ? <ActivityIndicator size="small" color={v.ink} /> : icon}
        <Text
          style={[type.button, { fontSize: FONT[size], color: off && variant !== 'ghost' && variant !== 'danger' ? colors.disabledInk : v.ink }]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const VARIANTS: Record<Variant, { box: ViewStyle; pressed: ViewStyle; ink: string }> = {
  primary: { box: { backgroundColor: colors.pine }, pressed: { backgroundColor: colors.pine2 }, ink: colors.brandInk },
  accent: {
    box: { backgroundColor: colors.sun, borderBottomWidth: 3, borderBottomColor: colors.sunDeep },
    pressed: { backgroundColor: colors.sunHover },
    ink: colors.pineDeep,
  },
  ghost: {
    box: { backgroundColor: 'transparent', borderWidth: 2, borderColor: colors.line },
    pressed: { backgroundColor: colors.brandSoft },
    ink: colors.pine,
  },
  danger: {
    box: { backgroundColor: 'transparent', borderWidth: 2, borderColor: colors.danger },
    pressed: { backgroundColor: colors.dangerSoft },
    ink: colors.danger,
  },
  onPine: {
    box: { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' },
    pressed: { backgroundColor: 'rgba(255,255,255,0.22)' },
    ink: colors.brandInk,
  },
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  inner: { flexDirection: rtl.row, alignItems: 'center', gap: 8 },
  block: { alignSelf: 'stretch' },
  pressed: { transform: [{ translateY: 1 }] },
  disabled: { backgroundColor: colors.disabledBg, borderBottomWidth: 0 },
  ghostDisabled: { opacity: 0.55 },
});
