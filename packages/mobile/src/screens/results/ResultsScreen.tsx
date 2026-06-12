import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { GAME_DISPLAY_NAMES } from '@lotto-maker/shared';
import type { GameType } from '@lotto-maker/shared';
import { resultsApi, drawsApi } from '../../api/client.js';
import type { DrawResultResponse, UpcomingDraw } from '../../api/client.js';

// Games that have numeric results (Chance is a card game — not yet supported)
const RESULT_GAMES: GameType[] = ['lotto', 'seven77', 'one23'];

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

function NumberBall({
  n,
  color,
  size = 36,
  isStrong = false,
}: {
  n: number;
  color: string;
  size?: number;
  isStrong?: boolean;
}) {
  const bg = isStrong ? '#e02424' : color;
  return (
    <View
      style={[
        styles.ball,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
        },
      ]}
    >
      <Text style={[styles.ballText, { fontSize: size < 32 ? 11 : 14 }]}>{n}</Text>
    </View>
  );
}

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
  const color = GAME_COLORS[gameType];
  const icon = GAME_ICONS[gameType];
  const name = GAME_DISPLAY_NAMES[gameType];

  const msUntilDraw = upcoming ? new Date(upcoming.drawTime).getTime() - now : 0;
  const isOpen = upcoming ? now < new Date(upcoming.hardCutoff).getTime() : false;

  return (
    <View style={[styles.card, { borderTopColor: color }]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardIcon}>{icon}</Text>
          <Text style={[styles.cardName, { color }]}>{name}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: isOpen ? '#d1fae5' : '#fee2e2' }]}>
          <Text style={[styles.statusText, { color: isOpen ? '#065f46' : '#991b1b' }]}>
            {isOpen ? 'פתוח' : 'סגור'}
          </Text>
        </View>
      </View>

      {/* Countdown */}
      {upcoming && (
        <View style={styles.countdownRow}>
          <Text style={styles.countdownLabel}>הגרלה הבאה בעוד</Text>
          <Text style={[styles.countdownValue, { color }]}>
            {formatCountdown(msUntilDraw)}
          </Text>
        </View>
      )}

      {/* Results */}
      <View style={styles.resultsSection}>
        <Text style={styles.resultsSectionTitle}>תוצאות אחרונות</Text>
        {loading && (
          <ActivityIndicator color={color} style={{ marginVertical: 12 }} />
        )}
        {!loading && error && (
          <Text style={styles.errorText}>לא ניתן לטעון תוצאות כרגע</Text>
        )}
        {!loading && !error && result && (
          <>
            <Text style={styles.drawMeta}>הגרלה #{result.drawNumber} · {formatDate(result.drawDate)}</Text>
            <View style={styles.numbersRow}>
              {result.winningNumbers.map((n) => (
                <NumberBall key={n} n={n} color={color} />
              ))}
              {result.strongNumber !== null && result.strongNumber !== undefined && (
                <>
                  <Text style={styles.plus}>+</Text>
                  <NumberBall n={result.strongNumber} color={color} isStrong />
                </>
              )}
            </View>
          </>
        )}
        {!loading && !error && !result && (
          <Text style={styles.errorText}>תוצאות טרם פורסמו</Text>
        )}
      </View>
    </View>
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
      <View style={styles.headerRow}>
        <Text style={styles.title}>תוצאות הגרלה</Text>
        <TouchableOpacity onPress={() => { void loadResults(); void loadUpcoming(); }}>
          <Text style={styles.refreshBtn}>רענן</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>נתונים ממפעל הפיס</Text>

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#f9fafb', paddingBottom: 32 },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 2, marginTop: 8,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#111827' },
  refreshBtn: { fontSize: 14, color: '#1a56db', fontWeight: '600' },
  subtitle: { fontSize: 13, color: '#6b7280', marginBottom: 16 },

  card: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 14,
    borderTopWidth: 4, overflow: 'hidden',
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.07,
    shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardIcon: { fontSize: 20 },
  cardName: { fontSize: 18, fontWeight: '700' },
  statusBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },

  countdownRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 6,
    backgroundColor: '#f9fafb', borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  countdownLabel: { fontSize: 12, color: '#6b7280' },
  countdownValue: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },

  resultsSection: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 8 },
  resultsSectionTitle: { fontSize: 11, color: '#9ca3af', fontWeight: '600', marginBottom: 8, letterSpacing: 0.5 },
  drawMeta: { fontSize: 12, color: '#6b7280', marginBottom: 10 },

  numbersRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    alignItems: 'center',
  },
  ball: { justifyContent: 'center', alignItems: 'center' },
  ballText: { color: '#fff', fontWeight: '700' },
  plus: { fontSize: 18, color: '#9ca3af', marginHorizontal: 2 },

  errorText: { fontSize: 13, color: '#9ca3af', marginVertical: 8 },
  footer: {
    fontSize: 11, color: '#9ca3af', textAlign: 'center',
    marginTop: 8, lineHeight: 16,
  },
});
