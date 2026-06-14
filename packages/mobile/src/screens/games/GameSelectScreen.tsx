import { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { GAME_DISPLAY_NAMES, GAME_BASE_PRICE, SERVICE_FEE } from '@lotto-maker/shared';
import type { GameType } from '@lotto-maker/shared';
import { drawsApi } from '../../api/client.js';
import type { UpcomingDraw } from '../../api/client.js';

const GAME_DESCRIPTIONS: Record<GameType, string> = {
  lotto: '6 מספרים מ-37 + מספר חזק',
  chance: '6 קלפים מ-37 + חזק',
  seven77: '7 מספרים מ-70',
  one23: '3 מספרים מ-9',
};

const GAME_COLORS: Record<GameType, string> = {
  lotto: '#1a56db',
  chance: '#f97316',
  seven77: '#7c3aed',
  one23: '#059669',
};

const GAME_ICONS: Record<GameType, string> = {
  lotto: '🎱',
  chance: '🃏',
  seven77: '7️⃣',
  one23: '🔢',
};

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'מתחיל עכשיו';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return `${days}י ${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

interface Props {
  onSelect: (game: GameType) => void;
}

export function GameSelectScreen({ onSelect }: Props) {
  const games: GameType[] = ['lotto', 'chance', 'seven77', 'one23'];
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
      <Text style={styles.title}>בחר משחק</Text>
      <Text style={styles.subtitle}>ההגרלות מתקיימות שלושה פעמים בשבוע</Text>
      {games.map((game) => {
        const draw = upcoming.find((u) => u.gameType === game);
        const color = GAME_COLORS[game];
        const isOpen = draw ? now < new Date(draw.hardCutoff).getTime() : false;
        const msUntilDraw = draw ? new Date(draw.drawTime).getTime() - now : 0;
        const price = GAME_BASE_PRICE[game] + SERVICE_FEE;

        return (
          <TouchableOpacity
            key={game}
            style={[styles.card, { borderLeftColor: color, borderLeftWidth: 4 }]}
            onPress={() => onSelect(game)}
            activeOpacity={0.8}
          >
            {/* Header row */}
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.gameIcon}>{GAME_ICONS[game]}</Text>
                <Text style={[styles.gameName, { color }]}>{GAME_DISPLAY_NAMES[game]}</Text>
              </View>
              {!loadingDraws && (
                <View style={[styles.statusBadge, { backgroundColor: isOpen ? '#d1fae5' : '#fee2e2' }]}>
                  <Text style={[styles.statusText, { color: isOpen ? '#065f46' : '#991b1b' }]}>
                    {isOpen ? 'פתוח ✓' : 'סגור'}
                  </Text>
                </View>
              )}
              {loadingDraws && <ActivityIndicator size="small" color={color} />}
            </View>

            {/* Description + countdown row */}
            <View style={styles.cardBody}>
              <Text style={styles.gameDesc}>{GAME_DESCRIPTIONS[game]}</Text>
              {draw && (
                <View style={styles.countdownRow}>
                  <Text style={styles.countdownLabel}>
                    {msUntilDraw > 0 ? 'הגרלה בעוד' : 'הגרלה בקרוב'}
                  </Text>
                  {msUntilDraw > 0 && (
                    <Text style={[styles.countdownValue, { color }]}>
                      {formatCountdown(msUntilDraw)}
                    </Text>
                  )}
                </View>
              )}
            </View>

            {/* Price */}
            <View style={styles.cardFooter}>
              <Text style={styles.priceLabel}>עלות טופס</Text>
              <Text style={[styles.price, { color }]}>₪{price.toFixed(1)}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#f9fafb', flexGrow: 1, paddingBottom: 32 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 4, marginTop: 8, color: '#111827' },
  subtitle: { fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 20 },

  card: {
    backgroundColor: '#fff', borderRadius: 12,
    marginBottom: 14, elevation: 2,
    shadowColor: '#000', shadowOpacity: 0.06,
    shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gameIcon: { fontSize: 22 },
  gameName: { fontSize: 20, fontWeight: '700' },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },

  cardBody: { paddingHorizontal: 14, paddingBottom: 8 },
  gameDesc: { fontSize: 13, color: '#6b7280', marginBottom: 6 },
  countdownRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countdownLabel: { fontSize: 12, color: '#9ca3af' },
  countdownValue: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },

  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#f3f4f6',
    backgroundColor: '#fafafa',
  },
  price: { fontSize: 20, fontWeight: '800' },
  priceLabel: { fontSize: 12, color: '#9ca3af' },
});
