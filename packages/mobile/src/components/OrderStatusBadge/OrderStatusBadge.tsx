import { View, Text, StyleSheet } from 'react-native';
import { ORDER_STATUS_LABELS } from '@lotto-maker/shared';
import type { OrderStatus } from '@lotto-maker/shared';
import { colors, fonts, radii } from '../../theme/index.js';

const NEUTRAL = { bg: colors.neutralSoft, text: colors.muted };

const STATUS_COLORS: Record<OrderStatus, { bg: string; text: string }> = {
  pending:         { bg: colors.sunSoft, text: colors.warnInk },
  in_queue:        { bg: colors.brandSoft, text: colors.pine },
  keyed:           { bg: colors.plumSoft, text: colors.plum },
  scanned:         { bg: colors.okSoft, text: colors.okInk },
  won:             { bg: colors.sun, text: colors.pineDeep },
  lost:            NEUTRAL,
  refunded:        { bg: colors.dangerSoft, text: colors.dangerInk },
  results_delayed: { bg: colors.sunSoft, text: colors.warnInk },
  cancelled:       NEUTRAL,
};

interface Props {
  status: OrderStatus;
}

export function OrderStatusBadge({ status }: Readonly<Props>) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.pending;
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.text }]}>
        {ORDER_STATUS_LABELS[status] ?? status}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
});
