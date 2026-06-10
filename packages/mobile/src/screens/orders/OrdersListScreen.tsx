import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { ordersApi } from '../../api/client.js';
import { OrderStatusBadge } from '../../components/OrderStatusBadge/OrderStatusBadge.js';
import { GAME_DISPLAY_NAMES } from '@lotto-maker/shared';
import type { OrderStatus, GameType } from '@lotto-maker/shared';

interface OrderRow {
  id: string;
  gameType: GameType;
  numbers: number[];
  status: OrderStatus;
  drawDate: string;
  totalCharged: string;
}

interface Props {
  onSelectOrder: (id: string) => void;
}

export function OrdersListScreen({ onSelectOrder }: Props) {
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

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#1a56db" />;

  return (
    <FlatList
      data={orders}
      keyExtractor={(o) => o.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={styles.empty}>אין הזמנות עדיין</Text>}
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.card} onPress={() => onSelectOrder(item.id)}>
          <View style={styles.cardTop}>
            <Text style={styles.gameName}>{GAME_DISPLAY_NAMES[item.gameType]}</Text>
            <OrderStatusBadge status={item.status} />
          </View>
          <Text style={styles.numbers}>{item.numbers?.join(', ')}</Text>
          <View style={styles.cardBottom}>
            <Text style={styles.date}>{new Date(item.drawDate).toLocaleDateString('he-IL')}</Text>
            <Text style={styles.price}>₪{item.totalCharged}</Text>
          </View>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 60, fontSize: 16 },
  card: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10,
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  gameName: { fontSize: 16, fontWeight: '700', color: '#1a56db' },
  numbers: { fontSize: 15, color: '#374151', fontVariant: ['tabular-nums'], marginBottom: 6 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  date: { fontSize: 13, color: '#9ca3af' },
  price: { fontSize: 13, fontWeight: '600', color: '#374151' },
});
