import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { subscriptionsApi } from '../../api/client.js';
import { GAME_DISPLAY_NAMES } from '@lotto-maker/shared';
import type { GameType, DrawDay } from '@lotto-maker/shared';

interface Sub {
  id: string;
  gameType: GameType;
  numbers: number[];
  strongNumber: number | null;
  drawDays: DrawDay[];
  active: boolean;
  nextDrawDate: string | null;
  pricePerDraw: string;
}

const DAY_LABELS: Record<DrawDay, string> = { tue: "ג'", thu: "ה'", sat: "ש'" };

export function SubscriptionsScreen() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await subscriptionsApi.list();
      setSubs(data as Sub[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCancel(id: string) {
    Alert.alert('ביטול מנוי', 'האם לבטל את המנוי?', [
      { text: 'לא' },
      {
        text: 'כן, בטל',
        style: 'destructive',
        onPress: async () => {
          await subscriptionsApi.cancel(id);
          setSubs((s) => s.filter((x) => x.id !== id));
        },
      },
    ]);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#1a56db" />;

  return (
    <FlatList
      data={subs}
      keyExtractor={(s) => s.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      ListEmptyComponent={<Text style={styles.empty}>אין מנויים פעילים</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={styles.gameName}>{GAME_DISPLAY_NAMES[item.gameType]}</Text>
            <Text style={styles.price}>₪{item.pricePerDraw} / הגרלה</Text>
          </View>
          <Text style={styles.numbers}>{item.numbers?.join(', ')}{item.strongNumber ? ` | ★ ${item.strongNumber}` : ''}</Text>
          <Text style={styles.days}>
            ימי הגרלה: {item.drawDays.map((d) => DAY_LABELS[d]).join(', ')}
          </Text>
          {item.nextDrawDate && (
            <Text style={styles.nextDraw}>
              הגרלה הבאה: {new Date(item.nextDrawDate).toLocaleDateString('he-IL')}
            </Text>
          )}
          <TouchableOpacity onPress={() => handleCancel(item.id)} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>בטל מנוי</Text>
          </TouchableOpacity>
        </View>
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
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  gameName: { fontSize: 17, fontWeight: '700', color: '#1a56db' },
  price: { fontSize: 14, color: '#6b7280', alignSelf: 'center' },
  numbers: { fontSize: 15, color: '#374151', marginBottom: 4 },
  days: { fontSize: 13, color: '#6b7280', marginBottom: 2 },
  nextDraw: { fontSize: 12, color: '#9ca3af', marginBottom: 8 },
  cancelBtn: { alignSelf: 'flex-end' },
  cancelText: { color: '#e02424', fontSize: 13, fontWeight: '600' },
});
