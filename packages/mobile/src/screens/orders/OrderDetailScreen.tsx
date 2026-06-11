import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { ordersApi } from '../../api/client.js';
import { OrderStatusBadge } from '../../components/OrderStatusBadge/OrderStatusBadge.js';
import { GAME_DISPLAY_NAMES, ORDER_STATUS_LABELS } from '@lotto-maker/shared';
import type { OrderStatus, GameType } from '@lotto-maker/shared';

const STATUS_STEPS: OrderStatus[] = ['pending', 'in_queue', 'keyed', 'scanned', 'won'];

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

interface Props {
  orderId: string;
}

export function OrderDetailScreen({ orderId }: Props) {
  const [order, setOrder] = useState<OrderDetail | null>(null);

  useEffect(() => {
    ordersApi.get(orderId).then((o) => setOrder(o as unknown as OrderDetail)).catch(console.error);
  }, [orderId]);

  if (!order) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#1a56db" />;

  const currentStep = STATUS_STEPS.indexOf(order.status as OrderStatus);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{GAME_DISPLAY_NAMES[order.gameType]}</Text>
      <OrderStatusBadge status={order.status as OrderStatus} />

      <View style={styles.numbersBox}>
        <Text style={styles.numbersLabel}>המספרים שלך</Text>
        <Text style={styles.numbers}>
          {order.numbers?.join(' — ')}
          {order.strongNumber ? ` | ★ ${order.strongNumber}` : ''}
        </Text>
      </View>

      {/* Status timeline */}
      <View style={styles.timeline}>
        {STATUS_STEPS.filter((s) => s !== 'won').map((step, idx) => {
          const done = idx <= currentStep;
          return (
            <View key={step} style={styles.timelineRow}>
              <View style={[styles.dot, done && styles.dotDone]} />
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
  numbersBox: {
    backgroundColor: '#eff6ff', borderRadius: 10, padding: 16, marginVertical: 16,
  },
  numbersLabel: { fontSize: 12, color: '#1e40af', fontWeight: '600', marginBottom: 4 },
  numbers: { fontSize: 20, fontWeight: '700', color: '#1e40af', letterSpacing: 2 },
  timeline: { marginBottom: 20 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  dot: {
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 2, borderColor: '#d1d5db', marginLeft: 12, marginRight: 8,
  },
  dotDone: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  stepLabel: { fontSize: 14, color: '#9ca3af' },
  stepLabelDone: { color: '#374151', fontWeight: '600' },
  scanSection: { marginBottom: 16 },
  scanLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  scanImage: { width: '100%', height: 280, borderRadius: 8, backgroundColor: '#f3f4f6' },
  meta: { fontSize: 13, color: '#9ca3af', lineHeight: 20, textAlign: 'right' },
});
