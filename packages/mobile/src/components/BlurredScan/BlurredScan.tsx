import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { colors, fonts, radii } from '../../theme/index.js';

const HEIGHT = 380;

/**
 * The ticket scan with its lower part, where the barcode is, blurred (as on
 * the website): the full ticket is only needed when collecting a big prize,
 * which the courier does for the customer. The blurred band is a second copy
 * of the image, bottom-aligned in a clipped strip so the two line up.
 */
export function BlurredScan({ url }: { url: string }) {
  return (
    <View style={styles.wrap} accessible accessibilityRole="image" accessibilityLabel="צילום הטופס שהוגש">
      <Image source={url} cachePolicy="none" style={styles.full} contentFit="contain" transition={300} />
      <View style={styles.band} pointerEvents="none">
        <Image source={url} cachePolicy="none" style={styles.bandImage} contentFit="contain" blurRadius={14} />
        <View style={styles.veil} />
        <Text style={styles.bandText}>הברקוד מוסתר לשמירה על הטופס</Text>
      </View>
      <View style={styles.frame} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: HEIGHT,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  full: { position: 'absolute', top: 0, left: 0, right: 0, height: HEIGHT },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: HEIGHT * 0.4,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bandImage: { position: 'absolute', left: 0, right: 0, bottom: 0, height: HEIGHT },
  veil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.35)' },
  bandText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.ink, textAlign: 'center', paddingHorizontal: 8 },
  frame: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.line,
  },
});
