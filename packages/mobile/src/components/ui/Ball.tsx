import { memo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { ballShades, colors, fonts, rtl, touch } from '../../theme/index.js';
import type { BallTone } from '../../theme/index.js';

/**
 * The glossy lottery ball. React Native has no radial gradient, so the shading
 * is stacked circles: the rim colour, the body offset up and to the left, a
 * soft glow and a specular highlight at about 35% / 28% (the web's gradient
 * centre). White for numbers, sun for picked or drawn numbers, plum for the
 * strong number.
 */
export const Ball = memo(function Ball({
  n,
  tone = 'sun',
  size = 36,
  dim = false,
  style,
}: {
  n: number | string;
  tone?: BallTone;
  size?: number;
  /** A number that did not match: kept legible but quiet. */
  dim?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const shade = ballShades[tone];
  return (
    <View
      style={[{ width: size, height: size, opacity: dim ? 0.55 : 1 }, style]}
      accessible
      accessibilityLabel={tone === 'plum' ? `המספר החזק ${n}` : String(n)}
    >
      <BallFace size={size} tone={tone} />
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text
          style={[styles.num, { color: shade.ink, fontSize: Math.round(size * 0.46), lineHeight: Math.round(size * 0.56) }]}
          allowFontScaling={false}
        >
          {n}
        </Text>
      </View>
    </View>
  );
});

/** Just the shaded sphere, for decoration and the brand mark. */
export function BallFace({ size, tone }: { size: number; tone: BallTone }) {
  const shade = ballShades[tone];
  const L = rtl.physicalLeft;
  const body = size * 0.9;
  const glow = size * 0.56;
  const spec = size * 0.2;
  return (
    <View
      pointerEvents="none"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: shade.lo, overflow: 'hidden' }}
    >
      <View
        style={{
          position: 'absolute', top: size * 0.01, [L]: size * 0.02,
          width: body, height: body, borderRadius: body / 2, backgroundColor: shade.mid,
        }}
      />
      <View
        style={{
          position: 'absolute', top: size * 0.06, [L]: size * 0.08,
          width: glow, height: glow, borderRadius: glow / 2, backgroundColor: shade.hi, opacity: 0.45,
        }}
      />
      <View
        style={{
          position: 'absolute', top: size * 0.17, [L]: size * 0.25,
          width: spec, height: spec, borderRadius: spec / 2, backgroundColor: shade.hi, opacity: 0.95,
        }}
      />
    </View>
  );
}

/** A row of balls that always reads left to right, like the printed ticket. */
export function BallRow({
  numbers,
  strong = [],
  size = 36,
  matched,
  strongMatched,
  gap = 6,
}: {
  numbers: number[];
  strong?: number[];
  size?: number;
  /** When given, numbers not in the set are dimmed white balls. */
  matched?: Set<number>;
  strongMatched?: number | null;
  gap?: number;
}) {
  return (
    <View style={[styles.row, { gap }]}>
      {numbers.map((n) => {
        const hit = matched ? matched.has(n) : true;
        return <Ball key={`n${n}`} n={n} size={size} tone={hit ? 'sun' : 'white'} dim={!hit} />;
      })}
      {strong.map((n) => {
        const hit = matched ? n === strongMatched : true;
        return (
          <Ball key={`s${n}`} n={n} size={size} tone={hit ? 'plum' : 'white'} dim={!hit} style={{ marginHorizontal: 2 }} />
        );
      })}
    </View>
  );
}

/**
 * A number the user can pick: a flat white disc that becomes a glossy sun
 * ball (or plum, for the strong number) when selected.
 */
export const BallButton = memo(function BallButton({
  n,
  size,
  selected,
  disabled,
  strong = false,
  onPress,
}: {
  n: number;
  size: number;
  selected: boolean;
  disabled?: boolean;
  strong?: boolean;
  onPress: (n: number) => void;
}) {
  const tone: BallTone = strong ? 'plum' : 'sun';
  const hit = Math.max(size, touch);
  return (
    <Pressable
      onPress={() => onPress(n)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      accessibilityLabel={strong ? `מספר חזק ${n}` : String(n)}
      hitSlop={(hit - size) / 2}
      style={({ pressed }) => [
        { width: size, height: size, opacity: disabled ? 0.4 : 1 },
        pressed && !disabled && { transform: [{ scale: 0.92 }] },
      ]}
    >
      {selected ? (
        <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: strong ? colors.plum : colors.pine, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', top: -2, left: -2 }}>
            <BallFace size={size} tone={tone} />
          </View>
        </View>
      ) : (
        <View
          style={{
            width: size, height: size, borderRadius: size / 2, borderWidth: 2,
            borderColor: strong ? colors.strongPickerBorder : colors.pickerBorder, backgroundColor: colors.surface,
          }}
        />
      )}
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <Text
          allowFontScaling={false}
          style={[
            styles.num,
            {
              fontSize: Math.round(size * 0.42),
              lineHeight: Math.round(size * 0.52),
              color: selected ? ballShades[tone].ink : colors.pineDeep,
            },
          ]}
        >
          {n}
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  num: { fontFamily: fonts.display, textAlign: 'center', includeFontPadding: false },
  row: { flexDirection: rtl.ltrRow, alignItems: 'center', flexWrap: 'wrap' },
});
