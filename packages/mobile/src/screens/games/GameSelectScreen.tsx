import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { BallFace, Button, Countdown, Perforation, ResponsibleNotice, Stub } from '../../components/ui/index.js';
import { colors, fonts, radii, rtl, spacing, type } from '../../theme/index.js';
import { GAME_DISPLAY_NAMES } from '@lotto-maker/shared';
import type { GameType } from '@lotto-maker/shared';
import { drawsApi } from '../../api/client.js';
import type { UpcomingDraw } from '../../api/client.js';

const GAME_DESCRIPTIONS: Record<GameType, string> = {
  lotto: '6 מספרים מ-37 + מספר חזק',
  chance: '6 קלפים מ-37 + חזק',
  seven77: '7 מספרים מ-70',
  one23: '3 מספרים מ-9',
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface Props {
  onSelect: (game: GameType) => void;
}

export function GameSelectScreen({ onSelect }: Props) {
  // Lotto only: the other games are blocked on the server (ENABLED_GAMES=lotto)
  const games: GameType[] = ['lotto'];
  const [upcoming, setUpcoming] = useState<UpcomingDraw[]>([]);
  const [loadingDraws, setLoadingDraws] = useState(true);
  const [now, setNow] = useState(Date.now());

  const loadUpcoming = useCallback(async () => {
    try {
      const data = await drawsApi.getUpcoming();
      setUpcoming(data);
    } catch {
      // Non-critical — open/closed and countdown won't show
    } finally {
      setLoadingDraws(false);
    }
  }, []);

  useEffect(() => {
    void loadUpcoming();
  }, [loadUpcoming]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={[styles.deco, { top: -30, [rtl.physicalLeft]: -36 }]}><BallFace size={120} tone="sun" /></View>
          <View style={[styles.deco, { top: -18, [rtl.physicalLeft]: 70 }]}><BallFace size={64} tone="plum" /></View>
          <View style={[styles.deco, { top: 92, [rtl.physicalLeft]: 34 }]}><BallFace size={34} tone="white" /></View>
        </View>
        <Text style={styles.title} accessibilityRole="header">בחר משחק</Text>
        <Text style={styles.subtitle}>הגרלות בימי שלישי ושבת, ולעיתים גם ביום נוסף</Text>

        {games.map((game) => {
          const draw = upcoming.find((u) => u.gameType === game);
          const isOpen = draw ? now < new Date(draw.hardCutoff).getTime() : false;
          const msUntilDraw = draw ? new Date(draw.drawTime).getTime() - now : 0;

          return (
            <Stub key={game} raised bordered={false} style={styles.stub}>
              {/* Game and open/closed */}
              <View style={styles.metaRow}>
                <Text style={styles.gameName}>{GAME_DISPLAY_NAMES[game]}</Text>
                {loadingDraws ? (
                  <ActivityIndicator size="small" color={colors.pine} />
                ) : (
                  <View style={[styles.statusBadge, isOpen ? styles.statusOpen : styles.statusClosed]}>
                    <Text style={[styles.statusText, { color: isOpen ? colors.okInk : colors.dangerInk }]}>
                      {isOpen ? 'פתוח ✓' : 'סגור'}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.gameDesc}>{GAME_DESCRIPTIONS[game]}</Text>
              {draw && (
                <Text style={styles.drawMeta}>
                  {draw.drawNumber ? `הגרלה מס׳ ${draw.drawNumber} · ` : ''}
                  <Text style={styles.drawMetaStrong}>{formatWhen(draw.drawTime)}</Text>
                </Text>
              )}

              {draw && (
                <>
                  <Perforation notchColor={colors.pine} bordered={false} />
                  <Text style={styles.countdownLabel}>
                    {msUntilDraw > 0 ? 'הגרלה בעוד' : 'הגרלה בקרוב'}
                  </Text>
                  {msUntilDraw > 0 && <Countdown remainingMs={msUntilDraw} />}
                  <Text style={styles.cutoffLine}>הזמנות נסגרות: {formatWhen(draw.hardCutoff)}</Text>
                </>
              )}

              {/* Price: depends on the tables chosen, shown live on the ticket screen */}
              <Text style={styles.priceLabel}>המחיר מחושב לפי מספר הטבלאות</Text>
              <Button
                label="למילוי טופס"
                onPress={() => onSelect(game)}
                variant="accent"
                size="lg"
                block
                accessibilityLabel={`למילוי טופס ${GAME_DISPLAY_NAMES[game]}`}
              />
            </Stub>
          );
        })}
      </View>

      <ResponsibleNotice />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.paper, flexGrow: 1, paddingBottom: spacing.xxxl },

  hero: {
    backgroundColor: colors.pine,
    borderRadius: radii.lg,
    paddingTop: 28,
    paddingHorizontal: 18,
    paddingBottom: 4,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  deco: { position: 'absolute' },
  title: {
    fontFamily: fonts.display, fontSize: 38, lineHeight: 42, color: colors.brandInk,
    textAlign: rtl.textStart, marginBottom: 6,
  },
  subtitle: { ...type.body, color: colors.onPineMuted, textAlign: rtl.textStart, marginBottom: spacing.xxl, maxWidth: 260, alignSelf: rtl.alignStart },

  stub: { marginBottom: 18 },
  metaRow: { flexDirection: rtl.row, justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  gameName: { ...type.h2, color: colors.pineDeep },
  statusBadge: { borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 4 },
  statusOpen: { backgroundColor: colors.okSoft },
  statusClosed: { backgroundColor: colors.dangerSoft },
  statusText: { fontFamily: fonts.bodyBold, fontSize: 13 },
  gameDesc: { ...type.small, textAlign: rtl.textStart },
  drawMeta: { ...type.small, textAlign: rtl.textStart, marginTop: 2 },
  drawMetaStrong: { fontFamily: fonts.bodyMedium, color: colors.ink },

  countdownLabel: { ...type.label, textAlign: rtl.textStart, marginBottom: 8 },
  cutoffLine: { ...type.caption, textAlign: rtl.textStart, marginTop: 10 },
  priceLabel: { ...type.caption, textAlign: 'center', marginTop: 14, marginBottom: 10 },
});
