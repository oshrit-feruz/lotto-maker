import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl,
} from 'react-native';
import { BallRow, Button, Card, EmptyState, LoadError, Loading, ScreenTitle } from '../../components/ui/index.js';
import { colors, fonts, rtl, spacing, type } from '../../theme/index.js';
import { subscriptionsApi } from '../../api/client.js';
import { confirmAction, notify } from '../../lib/confirm.js';
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
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await subscriptionsApi.list();
      setSubs(data as Sub[]);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleCancel(id: string) {
    confirmAction({
      title: 'ביטול מנוי',
      message: 'האם לבטל את המנוי?',
      cancelText: 'לא',
      confirmText: 'כן, בטל',
      destructive: true,
      onConfirm: async () => {
        try {
          await subscriptionsApi.cancel(id);
          setSubs((s) => s.filter((x) => x.id !== id));
        } catch {
          notify('שגיאה', 'לא הצלחנו לבטל את המנוי. נסה שנית.');
        }
      },
    });
  }

  function retry() {
    setLoading(true);
    load();
  }

  if (loading) return <Loading />;

  return (
    <FlatList
      data={subs}
      keyExtractor={(s) => s.id}
      style={styles.screen}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.pine} colors={[colors.pine]} onRefresh={() => { setRefreshing(true); load(); }} />}
      ListHeaderComponent={
        <>
          <ScreenTitle title="מנויים" />
          {error && <LoadError message="לא הצלחנו לטעון את המנויים." onRetry={retry} />}
        </>
      }
      ListEmptyComponent={error ? null : <EmptyState text="אין מנויים פעילים" />}
      renderItem={({ item }) => (
        <Card>
          <View style={styles.cardTop}>
            <Text style={styles.gameName}>{GAME_DISPLAY_NAMES[item.gameType]}</Text>
            <Text style={styles.price}>₪{item.pricePerDraw} / הגרלה</Text>
          </View>
          {item.numbers?.length ? (
            <View style={styles.balls}>
              <BallRow numbers={item.numbers} strong={item.strongNumber ? [item.strongNumber] : []} size={32} gap={5} />
            </View>
          ) : null}
          <View style={styles.daysRow}>
            <Text style={styles.days}>ימי הגרלה:</Text>
            {item.drawDays.map((d) => (
              <View key={d} style={styles.dayPill}><Text style={styles.dayText}>{DAY_LABELS[d]}</Text></View>
            ))}
          </View>
          {item.nextDrawDate && (
            <Text style={styles.nextDraw}>
              הגרלה הבאה: {new Date(item.nextDrawDate).toLocaleDateString('he-IL')}
            </Text>
          )}
          <Button label="בטל מנוי" onPress={() => handleCancel(item.id)} variant="danger" size="sm" style={styles.cancelBtn} />
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.paper },
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  cardTop: { flexDirection: rtl.row, justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  gameName: { fontFamily: fonts.display, fontSize: 20, lineHeight: 25, color: colors.pineDeep },
  price: { ...type.small },
  balls: { alignItems: rtl.alignStart, marginBottom: 10 },
  daysRow: { flexDirection: rtl.row, alignItems: 'center', gap: 6, marginBottom: 4 },
  days: { ...type.small },
  dayPill: {
    minWidth: 30, height: 26, borderRadius: 13, paddingHorizontal: 8,
    backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center',
  },
  dayText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.pine },
  nextDraw: { ...type.caption, marginBottom: 8, textAlign: rtl.textStart },
  cancelBtn: { alignSelf: rtl.alignEnd, marginTop: 4 },
});
