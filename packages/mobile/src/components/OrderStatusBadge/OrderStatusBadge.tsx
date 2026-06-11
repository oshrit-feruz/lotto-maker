import { View, Text, StyleSheet } from 'react-native';
import { ORDER_STATUS_LABELS } from '@lotto-maker/shared';
import type { OrderStatus } from '@lotto-maker/shared';

const STATUS_COLORS: Record<OrderStatus, { bg: string; text: string }> = {
  pending:         { bg: '#fef3c7', text: '#92400e' },
  in_queue:        { bg: '#dbeafe', text: '#1e40af' },
  keyed:           { bg: '#e0e7ff', text: '#3730a3' },
  scanned:         { bg: '#d1fae5', text: '#065f46' },
  won:             { bg: '#fef08a', text: '#713f12' },
  lost:            { bg: '#f3f4f6', text: '#6b7280' },
  refunded:        { bg: '#fee2e2', text: '#991b1b' },
  results_delayed: { bg: '#fef3c7', text: '#92400e' },
  cancelled:       { bg: '#f3f4f6', text: '#6b7280' },
};

interface Props {
  status: OrderStatus;
}

export function OrderStatusBadge({ status }: Props) {
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.pending;
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.text }]}>
        {ORDER_STATUS_LABELS[status] ?? status}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
  },
});
