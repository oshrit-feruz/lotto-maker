import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { ordersApi } from '../../api/client.js';
import { OrderStatusBadge } from '../../components/OrderStatusBadge/OrderStatusBadge.js';
import { ORDER_STATUS_LABELS, TICKET_TYPE_LABELS } from '@lotto-maker/shared';
import type { OrderStatus, TicketType } from '@lotto-maker/shared';

const STATUS_STEPS: OrderStatus[] = ['pending', 'in_queue', 'keyed', 'scanned', 'won'];
const COLOR = '#1a56db';

interface TableView {
  numbers: number[];
  strongNumbers: number[];
}

interface OrderDetail {
  id: string;
  status: OrderStatus;
  drawDate: string;
  totalCharged: string;
  hasScan: boolean;
  createdAt: string;
  ticket: { type: TicketType; systematicType: string | null; extra: boolean; tables: TableView[] } | null;
  draw: {
    drawNumber: number;
    drawAt: string;
    status: 'scheduled' | 'results_suggested' | 'results_confirmed' | 'settled';
    numbers: number[];
    strong: number | null;
    extraDigits: number[];
  } | null;
  extraDigits: number[];
  wins: Array<{ game: 'lotto' | 'double' | 'extra'; tier: string; count: number; amount: string }>;
  prizeClaim: { status: 'awaiting_pickup' | 'collected'; amount: string } | null;
  /** Legacy orders from before tickets. */
  numbers?: number[] | null;
  strongNumber?: number | null;
}

const GAME_LABELS = { lotto: 'לוטו', double: 'לוטו כפול', extra: 'Extra' } as const;

function tierLabel(game: 'lotto' | 'double' | 'extra', tier: string): string {
  if (game === 'extra') return `${tier} ספרות`;
  return tier.endsWith('+s') ? `${tier.slice(0, -2)} + חזק` : tier;
}

function Ball({ n, matched, strong, size = 34 }: { n: number; matched?: boolean; strong?: boolean; size?: number }) {
  const on = strong ? '#e02424' : COLOR;
  return (
    <View style={[
      styles.ball,
      { width: size, height: size, borderRadius: size / 2 },
      matched ? { backgroundColor: on, borderColor: on } : styles.ballUnmatched,
    ]}>
      <Text style={[styles.ballText, matched && styles.ballTextMatched]}>{n}</Text>
    </View>
  );
}

interface Props {
  orderId: string;
}

export function OrderDetailScreen({ orderId }: Props) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  // Short-lived signed URL, fetched each time the screen opens (never stored)
  const [scanUrl, setScanUrl] = useState<string | null>(null);

  useEffect(() => {
    setScanUrl(null);
    ordersApi.get(orderId).then((o) => {
      const detail = o as unknown as OrderDetail;
      setOrder(detail);
      if (detail.hasScan) {
        ordersApi.getScanUrl(orderId)
          .then(({ url }) => setScanUrl(url))
          .catch(() => {/* scan is optional on this screen */});
      }
    }).catch(console.error);
  }, [orderId]);

  if (!order) return <ActivityIndicator style={{ flex: 1 }} size="large" color={COLOR} />;

  const tables: TableView[] = order.ticket?.tables
    ?? (order.numbers ? [{ numbers: order.numbers, strongNumbers: order.strongNumber ? [order.strongNumber] : [] }] : []);

  // Draw numbers are shown only once an admin has confirmed them
  const confirmed = order.draw && (order.draw.status === 'results_confirmed' || order.draw.status === 'settled');
  const drawNumbers = new Set(confirmed ? order.draw!.numbers : []);
  const drawStrong = confirmed ? order.draw!.strong : null;

  const currentStep = STATUS_STEPS.indexOf(order.status);
  const totalWon = order.wins.reduce((sum, w) => sum + Number(w.amount), 0);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={[styles.title, { color: COLOR }]}>
        {order.ticket ? TICKET_TYPE_LABELS[order.ticket.type] : 'לוטו'}
        {order.ticket?.extra ? ' + Extra' : ''}
      </Text>
      <OrderStatusBadge status={order.status} />

      {order.draw && (
        <Text style={styles.drawLine}>
          הגרלה #{order.draw.drawNumber} · {new Date(order.draw.drawAt).toLocaleString('he-IL')}
        </Text>
      )}

      {/* Winning numbers, once confirmed */}
      {confirmed && order.draw && (
        <View style={[styles.section, { borderLeftColor: '#e02424' }]}>
          <Text style={styles.sectionLabel}>המספרים הזוכים</Text>
          <View style={styles.ballsRow}>
            {order.draw.numbers.map((n) => <Ball key={n} n={n} matched size={32} />)}
            {order.draw.strong !== null && (
              <>
                <Text style={styles.plus}>+</Text>
                <Ball n={order.draw.strong} matched strong size={32} />
              </>
            )}
          </View>
          {order.ticket?.extra && order.draw.extraDigits.length > 0 && (
            <Text style={styles.extraLine}>Extra: {order.draw.extraDigits.join(' ')}</Text>
          )}
        </View>
      )}

      {/* Tables */}
      {tables.map((t, i) => (
        <View key={i} style={[styles.section, { borderLeftColor: COLOR }]}>
          <Text style={styles.sectionLabel}>
            טבלה {i + 1}{order.ticket?.systematicType ? ` · ${order.ticket.systematicType}` : ''}
          </Text>
          <View style={styles.ballsRow}>
            {t.numbers.map((n) => (
              <Ball key={n} n={n} matched={confirmed ? drawNumbers.has(n) : undefined} />
            ))}
            {t.strongNumbers.length > 0 && <Text style={styles.plus}>+</Text>}
            {t.strongNumbers.map((n) => (
              <Ball key={`s${n}`} n={n} strong matched={confirmed ? n === drawStrong : undefined} />
            ))}
          </View>
        </View>
      ))}
      {order.ticket?.extra && order.extraDigits.length > 0 && (
        <Text style={styles.extraLine}>ספרות Extra שלך: {order.extraDigits.join(' ')}</Text>
      )}

      {/* Win per order */}
      {order.wins.length > 0 && (
        <View style={[styles.section, { borderLeftColor: '#059669' }]}>
          <Text style={styles.sectionLabel}>הזכייה שלך</Text>
          {order.wins.map((w) => (
            <View key={`${w.game}-${w.tier}`} style={styles.winRow}>
              <Text style={styles.winText}>
                {GAME_LABELS[w.game]} · {tierLabel(w.game, w.tier)}{w.count > 1 ? ` × ${w.count}` : ''}
              </Text>
              <Text style={styles.winText}>₪{Number(w.amount).toLocaleString('he-IL')}</Text>
            </View>
          ))}
          <View style={styles.winRow}>
            <Text style={[styles.winText, styles.winTotal]}>סה"כ</Text>
            <Text style={[styles.winText, styles.winTotal]}>₪{totalWon.toLocaleString('he-IL')}</Text>
          </View>
        </View>
      )}

      {/* Claim status: big prizes are collected in person */}
      {order.prizeClaim && (
        <View style={styles.claimBox}>
          {order.prizeClaim.status === 'awaiting_pickup' ? (
            <Text style={styles.claimText}>
              הפרס (₪{Number(order.prizeClaim.amount).toLocaleString('he-IL')}) לא הועבר לארנק.
              {'\n'}לאיסוף יש להגיע עם טופס המקור ותעודת זהות.
            </Text>
          ) : (
            <Text style={styles.claimText}>הפרס נאסף. ✓</Text>
          )}
        </View>
      )}

      {/* Status timeline */}
      <View style={styles.timeline}>
        {STATUS_STEPS.filter((s) => s !== 'won').map((step, idx) => {
          const done = idx <= currentStep;
          return (
            <View key={step} style={styles.timelineRow}>
              <View style={[styles.dot, done && { backgroundColor: COLOR, borderColor: COLOR }]} />
              <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>
                {ORDER_STATUS_LABELS[step] ?? step}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Ticket scan */}
      {scanUrl && (
        <View style={styles.scanSection}>
          <Text style={styles.scanLabel}>הטופס המקורי</Text>
          <Image
            source={scanUrl}
            cachePolicy="none"
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
  drawLine: { fontSize: 14, color: '#374151', marginTop: 8 },

  section: {
    borderRadius: 10, padding: 14, marginVertical: 8,
    borderLeftWidth: 4, backgroundColor: '#f9fafb',
  },
  sectionLabel: { fontSize: 12, color: '#6b7280', fontWeight: '600', marginBottom: 10 },
  ballsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  ball: { justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  ballUnmatched: { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb' },
  ballText: { fontWeight: '700', color: '#9ca3af', fontSize: 13 },
  ballTextMatched: { color: '#fff' },
  plus: { fontSize: 18, color: '#9ca3af', marginHorizontal: 2 },
  extraLine: { fontSize: 13, color: '#374151', marginTop: 6, direction: 'ltr', textAlign: 'right' },

  winRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  winText: { fontSize: 14, color: '#374151' },
  winTotal: { fontWeight: '700' },
  claimBox: { backgroundColor: '#fef3c7', borderRadius: 10, padding: 14, marginVertical: 8 },
  claimText: { color: '#92400e', fontSize: 14, textAlign: 'right', lineHeight: 20 },

  timeline: { marginBottom: 20, marginTop: 12 },
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
