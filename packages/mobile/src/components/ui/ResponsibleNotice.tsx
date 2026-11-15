import { View, Text, Pressable, Linking, StyleSheet } from 'react-native';
import { colors, fonts, radii, rtl, spacing, type } from '../../theme/index.js';
import { HELPLINE } from '../../config.js';

/**
 * Responsible gaming: an always-visible panel, never fine print. The 18+
 * badge and the 118 helpline are the same as the website's footer.
 */
export function ResponsibleNotice({ children }: { children?: string }) {
  return (
    <View style={styles.panel} accessibilityRole="summary">
      {children ? <Text style={styles.lead}>{children}</Text> : null}
      <View style={styles.row}>
        <View style={styles.age} accessible accessibilityLabel="מגיל 18 בלבד">
          <Text style={styles.ageText} allowFontScaling={false}>{'\u200E18+\u200E'}</Text>
        </View>
        <View style={styles.copy}>
          <Text style={styles.text}>
            השתתפות בהגרלות מותרת מגיל 18 בלבד. הימורים עלולים להתמכר. שחקו באחריות ובסכומים שאתם יכולים להרשות
            לעצמכם להפסיד. לעזרה ותמיכה בהתמכרות להימורים: קו סיוע{' '}
            <Text style={styles.helplineInline}>{HELPLINE}</Text>.
          </Text>
          <Pressable
            onPress={() => { void Linking.openURL(`tel:${HELPLINE}`); }}
            accessibilityRole="link"
            accessibilityLabel={`חיוג לקו הסיוע ${HELPLINE}`}
            style={({ pressed }) => [styles.helpline, pressed && styles.helplinePressed]}
          >
            {({ pressed }) => (
              <Text style={[styles.helplineText, pressed && { color: colors.pineDeep }]}>חיוג ל־{HELPLINE}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.pineDeep,
    borderRadius: radii.md,
    padding: 18,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  lead: {
    ...type.small,
    color: colors.disclaimerText,
    textAlign: rtl.textStart,
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.disclaimerLine,
  },
  row: { flexDirection: rtl.row, gap: 14, alignItems: 'flex-start' },
  age: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.sun,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ageText: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, color: colors.pineDeep },
  copy: { flex: 1, alignItems: rtl.alignStart },
  text: { ...type.body, fontSize: 15, lineHeight: 23, color: colors.brandInk, textAlign: rtl.textStart },
  helpline: {
    marginTop: 10,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.sun,
    justifyContent: 'center',
  },
  helplineInline: { fontFamily: fonts.bodyBold, color: colors.sun },
  helplinePressed:{ backgroundColor: colors.sun },
  helplineText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.brandInk },
});
