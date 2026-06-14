import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { ordersApi, resultsApi } from '../../api/client.js';
import type { DrawResultResponse } from '../../api/client.js';
import { OrderStatusBadge } from '../../components/OrderStatusBadge/OrderStatusBadge.js';
import { GAME_DISPLAY_NAMES, ORDER_STATUS_LABELS } from '@lotto-maker/shared';
import type { OrderStatus, GameType } from '@lotto-maker/shared';

const STATUS_STEPS: OrderStatus[] = ['pending', 'in_queue', 'keyed', 'scanned', 'won'];

const GAME_COLORS: Partial<Record<GameType, string>> = {
  lotto: '#1a56db',
  chance: '#f97316',
  seven77: '#7c3aed',
  one23: '#059669',
};

interface OrderDetail {
  id: string;
  gameType: GameType;
  numbers: number[];
  strongNumber: number | null;
  status: OrderStatus;
  drawDate: string;
  totalCharged: string;
  ticketScanUrl: string | null;
  createdAt: string;
}

function NumberBall({
  n, color, matched, size = 36,
}: {
  n: number; color: string; matched?: boolean; size?: number;
}) {
  return (
    <View style={[
      styles.ball,
      { width: size, height: size, borderRadius: size / 2 },
      matched ? { backgroundColor: color } : styles.ballUnmatched,
    ]}>
      <Text style={[styles.ballText, { fontSize: size < 32 ? 11 : 14 }, matched && styles.ballTextMatched]}>
        {n}
      </Text>
    </View>
  );
}

function StrongBall({ n, matched, size = 36 }: { n: number; matched?: boolean; size?: number }) {
  return (
    <View style={[
      styles.ball,
      { width: size, height: size, borderRadius: size / 2 },
      matched ? { backgroundColor: '#e02424' } : styles.ballUnmatched,
    ]}>
      <Text style={[styles.ballText, { fontSize: size < 32 ? 11 : 14 }, matched && styles.ballTextMatched]}>
        {n}
      </Text>
    </View>
  );
}

interface Props {
  orderId: string;
}

export function OrderDetailScreen({ orderId }: Props) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [drawResult, setDrawResult] = useState<DrawResultResponse | null>(null);
  const [loadingResult, setLoadingResult] = useState(false);

  useEffect(() => {
    ordersApi.get(orderId).then((o) => {
      const detail = o as unknown as OrderDetail;
      setOrder(detail);
      // Fetch draw result for won/lost/scanned orders
      if (['won', 'lost', 'scanned'].includes(detail.status)) {
        const dateStr = new Date(detail.drawDate).toISOString().slice(0, 10);
        setLoadingResult(true);
        resultsApi.getByDate(detail.gameType, dateStr)
          .then(setDrawResult)
          .catch(() => {/* non-critical */})
          .finally(() => setLoadingResult(false));
      }
    }).catch(console.error);
  }, [orderId]);

  if (!order) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#1a56db" />;

  const color = GAME_COLORS[order.gameType] ?? '#1a56db';
  const currentStep = STATUS_STEPS.indexOf(order.status as OrderStatus);
  const showResults = ['won', 'lost', 'scanned'].includes(order.status) && drawResult;
  const matchedNumbers = showResults
    ? new Set(order.numbers.filter((n) => drawResult!.winningNumbers.includes(n)))
    : new Set<number>();
  const strongMatched = showResults && order.strongNumber !== null
    && order.strongNumber === drawResult!.strongNumber;
  const matchCount = matchedNumbers.size;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={[styles.title, { color }]}>{GAME_DISPLAY_NAMES[order.gameType]}</Text>
      <OrderStatusBadge status={order.status as OrderStatus} />

      {/* User's numbers */}
      <View style={[styles.section, { borderLeftColor: color }]}>
        <Text style={styles.sectionLabel}>המספרים שלך</Text>
        <View style={styles.ballsRow}>
          {order.numbers?.map((n) => (
            <NumberBall
              key={n}
              n={n}
              color={color}
              matched={showResults ? matchedNumbers.has(n) : undefined}
            />
          ))}
          {order.strongNumber !== null && order.strongNumber !== undefined && (
            <>
              <Text style={styles.plus}>+</Text>
              <StrongBall
                n={order.strongNumber}
                matched={showResults ? strongMatched : undefined}
              />
            </>
          )}
        </View>
        {showResults && (
          <Text style={[styles.matchSummary, { color: matchCount >= 3 ? '#059669' : '#6b7280' }]}>
            {matchCount} התאמות{strongMatched ? ' + מספר חזק ✓' : ''}
          </Text>
        )}
      </View>

      {/* Winning numbers */}
      {(showResults || loadingResult) && (
        <View style={[styles.section, { borderLeftColor: '#e02424' }]}>
          <Text style={styles.sectionLabel}>מספרים זוכים · הגרלה #{drawResult?.drawNumber}</Text>
          {loadingResult && <ActivityIndicator color="#e02424" style={{ marginVertical: 8 }} />}
          {drawResult && (
            <View style={styles.ballsRow}>
              {drawResult.winningNumbers.map((n) => (
                <NumberBall
                  key={n}
                  n={n}
                  color={color}
                  matched={matchedNumbers.has(n)}
                  size={32}
                />
              ))}
              {drawResult.strongNumber !== null && drawResult.strongNumber !== undefined && (
                <>
                  <Text style={styles.plus}>+</Text>
                  <StrongBall n={drawResult.strongNumber} matched={strongMatched} size={32} />
                </>
              )}
            </View>
          )}
        </View>
      )}

      {/* Status timeline */}
      <View style={styles.timeline}>
        {STATUS_STEPS.filter((s) => s !== 'won').map((step, idx) => {
          const done = idx <= currentStep;
          return (
            <View key={step} style={styles.timelineRow}>
              <View style={[styles.dot, done && { backgroundColor: color, borderColor: color }]} />
              <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>
                {ORDER_STATUS_LABELS[step] ?? step}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Ticket scan */}
      {order.ticketScanUrl && (
        <View style={styles.scanSection}>
          <Text style={styles.scanLabel}>הטופס המקורי</Text>
          <Image
            source={order.ticketScanUrl}
            style={styles.scanImage}
            contentFit="contain"
            transition={300}
          />
        </View>
      )}

      <Text style={styles.meta}>
        תאריך הגרלה: {new Date(order.drawDate).toLocaleDateString('he-IL')}
        {'\n'}שולם: ₪{order.totalCharged}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#fff', flexGrow: 1 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },

  section: {
    borderRadius: 10, padding: 14, marginVertical: 10,
    borderLeftWidth: 4, backgroundColor: '#f9fafb',
  },
  sectionLabel: { fontSize: 12, color: '#6b7280', fontWeight: '600', marginBottom: 10 },
  ballsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  ball: { justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#e5e7eb' },
  ballUnmatched: { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb' },
  ballText: { fontWeight: '700', color: '#9ca3af' },
  ballTextMatched: { color: '#fff' },
  plus: { fontSize: 18, color: '#9ca3af', marginHorizontal: 2 },
  matchSummary: { fontSize: 13, fontWeight: '600', marginTop: 8 },

  timeline: { marginBottom: 20, marginTop: 4 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  dot: {
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 2, borderColor: '#d1d5db', marginLeft: 12, marginRight: 8,
  },
  stepLabel: { fontSize: 14, color: '#9ca3af' },
  stepLabelDone: { color: '#374151', fontWeight: '600' },

  scanSection: { marginBottom: 16 },
  scanLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  scanImage: { width: '100%', height: 280, borderRadius: 8, backgroundColor: '#f3f4f6' },
  meta: { fontSize: 13, color: '#9ca3af', lineHeight: 20, textAlign: 'right' },
});
