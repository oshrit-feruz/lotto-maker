import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, RefreshControl,
} from 'react-native';
import { EmptyState, Loading, ScreenTitle } from '../../components/ui/index.js';
import { colors, fonts, radii, rtl, shadows, spacing, type } from '../../theme/index.js';
import { ordersApi } from '../../api/client.js';
import { OrderStatusBadge } from '../../components/OrderStatusBadge/OrderStatusBadge.js';
import { GAME_DISPLAY_NAMES } from '@lotto-maker/shared';
import type { OrderStatus, GameType } from '@lotto-maker/shared';

interface OrderRow {
  id: string;
  gameType: GameType;
  /** Legacy orders from before tickets. */
  numbers?: number[] | null;
  ticket?: { tables: unknown[] } | null;
  draw?: { drawNumber: number } | null;
  status: OrderStatus;
  drawDate: string;
  totalCharged: string;
}

/** "4 טבלאות · הגרלה 3812" for a ticket order, the numbers for a legacy order. */
function orderSummary(item: OrderRow): string | undefined {
  if (!item.ticket) return item.numbers?.join(', ');
  const drawPart = item.draw ? ` · הגרלה ${item.draw.drawNumber}` : '';
  return `${item.ticket.tables.length} טבלאות${drawPart}`;
}

interface Props {
  onSelectOrder: (id: string) => void;
}

export function OrdersListScreen({ onSelectOrder }: Readonly<Props>) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await ordersApi.list();
      setOrders(data as OrderRow[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;

  return (
    <FlatList
      data={orders}
      keyExtractor={(o) => o.id}
      style={styles.screen}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.pine} colors={[colors.pine]} onRefresh={() => { setRefreshing(true); load(); }} />}
      contentContainerStyle={styles.list}
      ListHeaderComponent={<ScreenTitle title="הזמנות" />}
      ListEmptyComponent={<EmptyState text="אין הזמנות עדיין" />}
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={() => onSelectOrder(item.id)}
          accessibilityRole="button"
        >
          <View style={styles.cardTop}>
            <Text style={styles.gameName}>{GAME_DISPLAY_NAMES[item.gameType]}</Text>
            <OrderStatusBadge status={item.status} />
          </View>
          <Text style={styles.numbers}>
            {orderSummary(item)}
          </Text>
          <View style={styles.cardBottom}>
            <Text style={styles.date}>{new Date(item.drawDate).toLocaleDateString('he-IL')}</Text>
            <View style={styles.priceRow}>
              <Text style={styles.price}>₪{item.totalCharged}</Text>
              <Text style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no">‹</Text>
            </View>
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.paper },
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  card: {
    backgroundColor: colors.surface, borderRadius: radii.md, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: colors.line, minHeight: 44,
    ...shadows.card,
  },
  cardPressed: { borderColor: colors.pine2 },
  cardTop: { flexDirection: rtl.row, justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  gameName: { fontFamily: fonts.display, fontSize: 20, lineHeight: 25, color: colors.pineDeep },
  numbers: { ...type.body, fontSize: 15, fontVariant: ['tabular-nums'], marginBottom: 8, textAlign: rtl.textStart },
  cardBottom: { flexDirection: rtl.row, justifyContent: 'space-between', alignItems: 'center' },
  date: { ...type.small },
  priceRow: { flexDirection: rtl.row, alignItems: 'center', gap: 10 },
  price: { ...type.smallStrong, fontVariant: ['tabular-nums'] },
  chevron: { fontFamily: fonts.bodyBold, fontSize: 22, lineHeight: 24, color: colors.pine2 },
});
