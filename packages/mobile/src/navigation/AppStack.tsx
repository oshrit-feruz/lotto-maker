import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { GameSelectScreen } from '../screens/games/GameSelectScreen.js';
import { LottoFormScreen } from '../screens/games/LottoFormScreen.js';
import { CartScreen } from '../screens/cart/CartScreen.js';
import { OrdersListScreen } from '../screens/orders/OrdersListScreen.js';
import { OrderDetailScreen } from '../screens/orders/OrderDetailScreen.js';
import { SubscriptionsScreen } from '../screens/subscriptions/SubscriptionsScreen.js';
import { WalletScreen } from '../screens/wallet/WalletScreen.js';
import { useCartStore } from '../store/cart.store.js';
import type { GameType } from '@lotto-maker/shared';

type Tab = 'home' | 'orders' | 'subscriptions' | 'wallet';
type HomeStep = 'select' | 'lotto' | 'cart';

export function AppStack() {
  const [tab, setTab] = useState<Tab>('home');
  const [homeStep, setHomeStep] = useState<HomeStep>('select');
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const cartCount = useCartStore((s) => s.items.length);

  function renderContent() {
    if (tab === 'orders') {
      if (selectedOrderId) return <OrderDetailScreen orderId={selectedOrderId} />;
      return <OrdersListScreen onSelectOrder={(id) => setSelectedOrderId(id)} />;
    }
    if (tab === 'subscriptions') return <SubscriptionsScreen />;
    if (tab === 'wallet') return <WalletScreen />;

    // Home tab
    if (homeStep === 'cart') {
      return <CartScreen onOrderPlaced={() => { setHomeStep('select'); setTab('orders'); }} />;
    }
    if (homeStep === 'lotto' && selectedGame === 'lotto') {
      return <LottoFormScreen onAddedToCart={() => setHomeStep('cart')} />;
    }
    return (
      <GameSelectScreen
        onSelect={(game) => {
          setSelectedGame(game);
          // For MVP: only lotto form is fully implemented; others show lotto as placeholder
          setHomeStep('lotto');
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {renderContent()}
      </View>

      {/* Bottom tab bar */}
      <View style={styles.tabBar}>
        {([
          { id: 'home', label: 'בית', icon: '🏠' },
          { id: 'orders', label: 'הזמנות', icon: '📋' },
          { id: 'subscriptions', label: 'מנויים', icon: '🔄' },
          { id: 'wallet', label: 'ארנק', icon: '💳' },
        ] as const).map(({ id, label, icon }) => (
          <TouchableOpacity
            key={id}
            style={styles.tab}
            onPress={() => {
              setTab(id);
              if (id !== 'orders') setSelectedOrderId(null);
              if (id !== 'home') setHomeStep('select');
            }}
          >
            <Text style={styles.tabIcon}>{icon}</Text>
            {id === 'home' && cartCount > 0 && (
              <View style={styles.badge}><Text style={styles.badgeText}>{cartCount}</Text></View>
            )}
            <Text style={[styles.tabLabel, tab === id && styles.tabLabelActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { flex: 1 },
  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#e5e7eb',
    paddingBottom: 8,
  },
  tab: { flex: 1, alignItems: 'center', paddingTop: 8 },
  tabIcon: { fontSize: 22 },
  tabLabel: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  tabLabelActive: { color: '#1a56db', fontWeight: '700' },
  badge: {
    position: 'absolute', top: 0, right: 12,
    backgroundColor: '#e02424', borderRadius: 8,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
