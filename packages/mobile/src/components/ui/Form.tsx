import { forwardRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import type { TextInputProps, StyleProp, ViewStyle } from 'react-native';
import { colors, fonts, radii, rtl, spacing, type } from '../../theme/index.js';

/** A labelled text input (48pt tall, pine focus ring). */
export const Field = forwardRef<TextInput, Readonly<TextInputProps & { label: string; hint?: string; ltr?: boolean }>>(
  function Field({ label, hint, ltr, style, onFocus, onBlur, ...props }, ref) {
    const [focused, setFocused] = useState(false);
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          ref={ref}
          placeholderTextColor={colors.faint}
          textAlign={ltr ? undefined : (rtl.textStart as 'left' | 'right')}
          {...props}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          style={[styles.input, ltr && styles.ltr, focused && styles.focused, style]}
        />
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    );
  },
);

/** Two or three mutually exclusive options in a pill track. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: Readonly<{
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}>) {
  return (
    <View style={[styles.segmented, style]} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            style={[styles.segment, on && styles.segmentOn]}
          >
            <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.lg },
  label: { ...type.label, marginBottom: 6, textAlign: rtl.textStart },
  input: {
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.inputBorder,
    backgroundColor: colors.surface,
    fontFamily: fonts.body,
    fontSize: 17,
    color: colors.ink,
  },
  ltr: { writingDirection: 'ltr' },
  focused: { borderColor: colors.pine, borderWidth: 2 },
  hint: { ...type.caption, marginTop: 6, textAlign: rtl.textStart },
  segmented: {
    flexDirection: rtl.row,
    padding: 4,
    gap: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.brandSoft,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  segmentOn: { backgroundColor: colors.pine },
  segmentText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.pine },
  segmentTextOn: { color: colors.brandInk },
});
