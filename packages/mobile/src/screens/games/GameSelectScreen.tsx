import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { GAME_DISPLAY_NAMES, GAME_BASE_PRICE, SERVICE_FEE } from '@lotto-maker/shared';
import type { GameType } from '@lotto-maker/shared';

const GAME_DESCRIPTIONS: Record<GameType, string> = {
  lotto: '6 מספרים מ-37 + מספר חזק',
  chance: "6 מספרים מ-37 + מספר חזק",
  seven77: '7 מספרים מ-70',
  one23: '3 מספרים מ-9',
};

interface Props {
  onSelect: (game: GameType) => void;
}

export function GameSelectScreen({ onSelect }: Props) {
  const games: GameType[] = ['lotto', 'chance', 'seven77', 'one23'];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>בחר משחק</Text>
      {games.map((game) => (
        <TouchableOpacity key={game} style={styles.card} onPress={() => onSelect(game)} activeOpacity={0.8}>
          <View style={styles.cardLeft}>
            <Text style={styles.gameName}>{GAME_DISPLAY_NAMES[game]}</Text>
            <Text style={styles.gameDesc}>{GAME_DESCRIPTIONS[game]}</Text>
          </View>
          <View style={styles.cardRight}>
            <Text style={styles.price}>₪{(GAME_BASE_PRICE[game] + SERVICE_FEE).toFixed(1)}</Text>
            <Text style={styles.priceLabel}>לטופס</Text>
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#f9fafb', flexGrow: 1 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 20, marginTop: 8 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 18,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06,
    shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  cardLeft: { flex: 1 },
  cardRight: { alignItems: 'flex-end' },
  gameName: { fontSize: 20, fontWeight: '700', color: '#1a56db', marginBottom: 4 },
  gameDesc: { fontSize: 13, color: '#6b7280' },
  price: { fontSize: 20, fontWeight: '700', color: '#374151' },
  priceLabel: { fontSize: 11, color: '#9ca3af' },
});
