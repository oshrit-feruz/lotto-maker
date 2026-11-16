import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { BlurredScan } from '../../components/BlurredScan/BlurredScan.js';
import {
  Amount, BallFace, BallRow, Card, LoadError, Loading, Notice, Perforation, Stub,
} from '../../components/ui/index.js';
import { colors, fonts, radii, rtl, spacing, type } from '../../theme/index.js';
import { ordersApi } from '../../api/client.js';
import { OrderStatusBadge } from '../../components/OrderStatusBadge/OrderStatusBadge.js';
import { ORDER_STATUS_LABELS, TICKET_TYPE_LABELS } from '@lotto-maker/shared';
import type { OrderStatus, TicketType } from '@lotto-maker/shared';

const STATUS_STEPS: OrderStatus[] = ['pending', 'in_queue', 'keyed', 'scanned', 'won'];

interface TableView {
  numbers: number[];
  strongNumbers: number[];
}

/** Keys a table by its numbers; a repeated table gets a running count so keys stay unique. */
function withTableKeys(tables: TableView[]): Array<{ table: TableView; key: string }> {
  const seen = new Map<string, number>();
  return tables.map((table) => {
    const base = `${table.numbers.join('-')}|${table.strongNumbers.join('-')}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { table, key: `${base}#${n}` };
  });
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

const GAME_LABELS = { lotto: 'לוטו', double: 'דאבל לוטו', extra: 'Extra' } as const;

function tierLabel(game: 'lotto' | 'double' | 'extra', tier: string): string {
  if (game === 'extra') return `${tier} ספרות`;
  return tier.endsWith('+s') ? `${tier.slice(0, -2)} + חזק` : tier;
}

interface Props {
  orderId: string;
}

export function OrderDetailScreen({ orderId }: Readonly<Props>) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  // Short-lived signed URL, fetched each time the screen opens (never stored)
  const [scanUrl, setScanUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    setScanUrl(null);
    ordersApi.get(orderId).then((o) => {
      const detail = o as unknown as OrderDetail;
      setOrder(detail);
      if (detail.hasScan) {
        ordersApi.getScanUrl(orderId)
          .then(({ url }) => setScanUrl(url))
          .catch(() => {/* scan is optional on this screen */});
      }
    }).catch(() => setError(true));
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <LoadError message="לא הצלחנו לטעון את ההזמנה." onRetry={load} />
      </ScrollView>
    );
  }

  if (!order) return <Loading />;

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
      <View style={styles.titleRow}>
        <Text style={styles.title} accessibilityRole="header">
          {order.ticket ? TICKET_TYPE_LABELS[order.ticket.type] : 'לוטו'}
          {order.ticket?.extra ? ' + Extra' : ''}
        </Text>
        <OrderStatusBadge status={order.status} />
      </View>

      {order.draw && (
        <Text style={styles.drawLine}>
          הגרלה #{order.draw.drawNumber} · {new Date(order.draw.drawAt).toLocaleString('he-IL')}
        </Text>
      )}

      <Stub>
        {/* Winning numbers, once confirmed */}
        {confirmed && order.draw && (
          <>
            <Text style={styles.sectionLabel}>המספרים הזוכים</Text>
            <BallRow
              numbers={order.draw.numbers}
              strong={order.draw.strong !== null ? [order.draw.strong] : []}
              size={34}
            />
            {order.ticket?.extra && order.draw.extraDigits.length > 0 && (
              <Text style={styles.extraLine}>Extra: {order.draw.extraDigits.join(' ')}</Text>
            )}
            <Perforation />
          </>
        )}

        {/* Tables */}
        <Text style={styles.sectionLabel}>
          {confirmed ? 'הטבלאות שלך: מספר שעלה בהגרלה מסומן בצהוב' : 'הטבלאות שלך'}
        </Text>
        {withTableKeys(tables).map(({ table: t, key }, i) => (
          <View key={key} style={[styles.tableRow, i > 0 && styles.tableDivider]}>
            <Text style={styles.tableIndex}>
              {i + 1}
            </Text>
            <View style={styles.tableBalls}>
              <BallRow
                numbers={t.numbers}
                strong={t.strongNumbers}
                size={32}
                gap={5}
                matched={confirmed ? drawNumbers : undefined}
                strongMatched={drawStrong}
              />
            </View>
          </View>
        ))}
        {order.ticket?.systematicType ? <Text style={styles.extraLine}>{order.ticket.systematicType}</Text> : null}
        {order.ticket?.extra && order.extraDigits.length > 0 && (
          <Text style={styles.extraLine}>ספרות Extra שלך: {order.extraDigits.join(' ')}</Text>
        )}

        <Perforation />
        <View style={styles.metaRow}>
          <Text style={styles.meta}>תאריך הגרלה</Text>
          <Text style={styles.metaValue}>{new Date(order.drawDate).toLocaleDateString('he-IL')}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>שולם</Text>
          <Text style={styles.metaValue}>₪{order.totalCharged}</Text>
        </View>
      </Stub>

      {/* Win per order */}
      {order.wins.length > 0 && (
        <View style={styles.winCard}>
          <Text style={styles.winTitle}>הזכייה שלך</Text>
          {order.wins.map((w) => (
            <View key={`${w.game}-${w.tier}`} style={styles.winRow}>
              <Text style={styles.winText}>
                {GAME_LABELS[w.game]} · {tierLabel(w.game, w.tier)}{w.count > 1 ? ` × ${w.count}` : ''}
              </Text>
              <Text style={styles.winText}>₪{Number(w.amount).toLocaleString('he-IL')}</Text>
            </View>
          ))}
          <View style={[styles.winRow, styles.winTotalRow]}>
            <Text style={styles.winTotalLabel}>סה"כ</Text>
            <Amount value={`₪${totalWon.toLocaleString('he-IL')}`} style={styles.winTotal} />
          </View>
        </View>
      )}

      {/* Claim status: big prizes are collected in person */}
      {order.prizeClaim && (
        order.prizeClaim.status === 'awaiting_pickup' ? (
          <Notice tone="warn">
            {`הפרס (₪${Number(order.prizeClaim.amount).toLocaleString('he-IL')}) לא הועבר לארנק.\nלאיסוף יש להגיע עם טופס המקור ותעודת זהות.`}
          </Notice>
        ) : (
          <Notice tone="ok">הפרס נאסף. ✓</Notice>
        )
      )}

      {/* Status timeline */}
      <Card>
        {STATUS_STEPS.filter((s) => s !== 'won').map((step, idx, all) => {
          const done = idx <= currentStep;
          const last = idx === all.length - 1;
          return (
            <View key={step} style={styles.timelineRow}>
              <View style={styles.dotCol}>
                {done ? <BallFace size={20} tone="sun" /> : <View style={styles.dot} />}
                {!last && <View style={[styles.track, done && idx < currentStep && styles.trackDone]} />}
              </View>
              <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>
                {ORDER_STATUS_LABELS[step] ?? step}
              </Text>
            </View>
          );
        })}
      </Card>

      {/* Ticket scan */}
      {scanUrl && (
        <View style={styles.scanSection}>
          <Text style={styles.scanLabel}>הטופס המקורי</Text>
          <BlurredScan url={scanUrl} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, backgroundColor: colors.paper, flexGrow: 1, paddingBottom: spacing.xxxl },
  titleRow: { flexDirection: rtl.row, alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  title: { ...type.h1, fontSize: 28, lineHeight: 34, color: colors.pineDeep, textAlign: rtl.textStart, flexShrink: 1 },
  drawLine: { ...type.small, textAlign: rtl.textStart, marginBottom: spacing.lg },

  sectionLabel: { ...type.label, color: colors.muted, marginBottom: 10, textAlign: rtl.textStart },
  tableRow: { flexDirection: rtl.row, alignItems: 'center', gap: 10, paddingVertical: 8 },
  tableDivider: { borderTopWidth: 1, borderTopColor: colors.line },
  tableIndex: { fontFamily: fonts.display, fontSize: 18, color: colors.muted, minWidth: 16, textAlign: 'center' },
  tableBalls: { flex: 1, alignItems: rtl.alignEnd },
  extraLine: { ...type.small, color: colors.ink, marginTop: 8, textAlign: rtl.textStart },

  metaRow: { flexDirection: rtl.row, justifyContent: 'space-between', paddingVertical: 2 },
  meta: { ...type.small },
  metaValue: { ...type.smallStrong, fontVariant: ['tabular-nums'] },

  winCard: {
    backgroundColor: colors.okSoft, borderRadius: radii.md, borderWidth: 1, borderColor: colors.okLine,
    padding: 16, marginBottom: spacing.lg,
  },
  winTitle: { ...type.h3, color: colors.okInk, textAlign: rtl.textStart, marginBottom: 8 },
  winRow: { flexDirection: rtl.row, justifyContent: 'space-between', marginBottom: 4 },
  winText: { ...type.body, fontSize: 15 },
  winTotalRow: { marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.okLine, alignItems: 'baseline' },
  winTotalLabel: { ...type.bodyStrong },
  winTotal: { fontSize: 26, lineHeight: 32, color: colors.okInk },

  timelineRow: { flexDirection: rtl.row, alignItems: 'flex-start', gap: 12 },
  dotCol: { width: 20, alignItems: 'center' },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.emptyRing, backgroundColor: colors.surface },
  track: { width: 2, height: 18, backgroundColor: colors.line, marginVertical: 2 },
  trackDone: { backgroundColor: colors.sunDeep },
  stepLabel: { ...type.body, fontSize: 15, lineHeight: 20, color: colors.muted },
  stepLabelDone: { color: colors.ink, fontFamily: fonts.bodyMedium },

  scanSection: { marginBottom: spacing.lg },
  scanLabel: { ...type.h3, textAlign: rtl.textStart, marginBottom: 8 },
});
