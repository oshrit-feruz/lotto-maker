import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { BallRow, Button, Card, ResponsibleNotice, ScreenTitle } from '../../components/ui/index.js';
import { colors, fonts, radii, rtl, spacing, type } from '../../theme/index.js';
import { GAME_DISPLAY_NAMES } from '@lotto-maker/shared';
import type { GameType } from '@lotto-maker/shared';
import { resultsApi, drawsApi } from '../../api/client.js';
import type { DrawResultResponse, UpcomingDraw } from '../../api/client.js';

// Games that have numeric results (Chance is a card game — not yet supported)
const RESULT_GAMES: GameType[] = ['lotto', 'seven77', 'one23'];

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'עכשיו';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return `${days}ג ${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

interface GameCardProps {
  gameType: GameType;
  result: DrawResultResponse | null;
  error: boolean;
  loading: boolean;
  upcoming: UpcomingDraw | undefined;
  now: number;
}

function GameCard({ gameType, result, error, loading, upcoming, now }: GameCardProps) {
  const name = GAME_DISPLAY_NAMES[gameType];

  const msUntilDraw = upcoming ? new Date(upcoming.drawTime).getTime() - now : 0;
  const isOpen = upcoming ? now < new Date(upcoming.hardCutoff).getTime() : false;

  return (
    <Card style={styles.card}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <Text style={styles.cardName}>{name}</Text>
        <View style={[styles.statusBadge, isOpen ? styles.statusOpen : styles.statusClosed]}>
          <Text style={[styles.statusText, { color: isOpen ? colors.okInk : colors.dangerInk }]}>
            {isOpen ? 'פתוח' : 'סגור'}
          </Text>
        </View>
      </View>

      {/* Countdown */}
      {upcoming && (
        <View style={styles.countdownRow}>
          <Text style={styles.countdownLabel}>הגרלה הבאה בעוד</Text>
          <Text style={styles.countdownValue}>
            {formatCountdown(msUntilDraw)}
          </Text>
        </View>
      )}

      {/* Results */}
      <View style={styles.resultsSection}>
        <Text style={styles.resultsSectionTitle}>תוצאות אחרונות</Text>
        {loading && (
          <ActivityIndicator color={colors.pine} style={{ marginVertical: 12 }} />
        )}
        {!loading && error && (
          <Text style={styles.errorText}>לא ניתן לטעון תוצאות כרגע</Text>
        )}
        {!loading && !error && result && (
          <>
            <Text style={styles.drawMeta}>הגרלה #{result.drawNumber} · {formatDate(result.drawDate)}</Text>
            <BallRow
              numbers={result.winningNumbers}
              strong={result.strongNumber !== null && result.strongNumber !== undefined ? [result.strongNumber] : []}
              size={38}
            />
          </>
        )}
        {!loading && !error && !result && (
          <Text style={styles.errorText}>תוצאות טרם פורסמו</Text>
        )}
      </View>
    </Card>
  );
}

export function ResultsScreen() {
  const [results, setResults] = useState<Partial<Record<GameType, DrawResultResponse>>>({});
  const [errors, setErrors] = useState<Partial<Record<GameType, boolean>>>({});
  const [loading, setLoading] = useState<Partial<Record<GameType, boolean>>>({
    lotto: true, seven77: true, one23: true,
  });
  const [upcoming, setUpcoming] = useState<UpcomingDraw[]>([]);
  const [now, setNow] = useState(Date.now());

  const loadResults = useCallback(async () => {
    // Fetch all game results in parallel
    await Promise.all(
      RESULT_GAMES.map(async (game) => {
        setLoading((prev) => ({ ...prev, [game]: true }));
        setErrors((prev) => ({ ...prev, [game]: false }));
        try {
          const data = await resultsApi.getLatest(game);
          setResults((prev) => ({ ...prev, [game]: data }));
        } catch {
          setErrors((prev) => ({ ...prev, [game]: true }));
        } finally {
          setLoading((prev) => ({ ...prev, [game]: false }));
        }
      }),
    );
  }, []);

  const loadUpcoming = useCallback(async () => {
    try {
      const data = await drawsApi.getUpcoming();
      setUpcoming(data);
    } catch {
      // Non-critical — countdown just won't show
    }
  }, []);

  useEffect(() => {
    void loadResults();
    void loadUpcoming();
  }, [loadResults, loadUpcoming]);

  // Tick every second for countdown
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <ScreenTitle
        title="תוצאות הגרלה"
        subtitle="נתונים ממפעל הפיס"
        end={(
          <Button
            label="רענן"
            onPress={() => { void loadResults(); void loadUpcoming(); }}
            variant="ghost"
            size="sm"
          />
        )}
      />

      {RESULT_GAMES.map((game) => (
        <GameCard
          key={game}
          gameType={game}
          result={results[game] ?? null}
          error={errors[game] ?? false}
          loading={loading[game] ?? false}
          upcoming={upcoming.find((u) => u.gameType === game)}
          now={now}
        />
      ))}

      <Text style={styles.footer}>
        ©️ נתונים מסופקים על-ידי מפעל הפיס. האפליקציה אינה קשורה למפעל הפיס.
      </Text>

      <ResponsibleNotice />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.paper, paddingBottom: spacing.xxxl },

  card: { padding: 0, overflow: 'hidden' },
  cardHeader: {
    flexDirection: rtl.row, justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
  },
  cardName: { ...type.h2, color: colors.pineDeep },
  statusBadge: { borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 3 },
  statusOpen: { backgroundColor: colors.okSoft },
  statusClosed: { backgroundColor: colors.dangerSoft },
  statusText: { fontFamily: fonts.bodyBold, fontSize: 13 },

  countdownRow: {
    flexDirection: rtl.row, alignItems: 'center', justifyContent: 'space-between', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: colors.pine,
  },
  countdownLabel: { ...type.small, color: colors.onPineMuted },
  countdownValue: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, color: colors.sun, fontVariant: ['tabular-nums'] },

  resultsSection: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 12 },
  resultsSectionTitle: { ...type.label, color: colors.muted, marginBottom: 4, textAlign: rtl.textStart },
  drawMeta: { ...type.small, marginBottom: 10, textAlign: rtl.textStart },

  errorText: { ...type.small, marginVertical: 8, textAlign: rtl.textStart },
  footer: {
    ...type.caption, textAlign: 'center',
    marginTop: 4, marginBottom: spacing.md,
  },
});
