import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GameSelectScreen } from '../screens/games/GameSelectScreen.js';
import { LottoFormScreen } from '../screens/games/LottoFormScreen.js';
import { CartScreen } from '../screens/cart/CartScreen.js';
import { OrdersListScreen } from '../screens/orders/OrdersListScreen.js';
import { OrderDetailScreen } from '../screens/orders/OrderDetailScreen.js';
import { SubscriptionsScreen } from '../screens/subscriptions/SubscriptionsScreen.js';
import { WalletScreen } from '../screens/wallet/WalletScreen.js';
import { ResultsScreen } from '../screens/results/ResultsScreen.js';
import { useCartStore } from '../store/cart.store.js';
import { useAuthStore } from '../store/auth.store.js';
import { AppHeader } from '../components/ui/index.js';
import { colors, fonts, radii, rtl, shadows } from '../theme/index.js';
import type { GameType } from '@lotto-maker/shared';

type Tab = 'home' | 'results' | 'orders' | 'subscriptions' | 'wallet';
type HomeStep = 'select' | 'lotto' | 'cart';

export function AppStack() {
  const [tab, setTab] = useState<Tab>('home');
  const [homeStep, setHomeStep] = useState<HomeStep>('select');
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const cartCount = useCartStore((s) => s.items.length);

  function renderContent() {
    if (tab === 'results') return <ResultsScreen />;
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

  const balance = useAuthStore((s) => s.user?.walletBalance);
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <AppHeader
        end={balance !== undefined ? (
          <View style={styles.balanceChip} accessible accessibilityLabel={`יתרת ארנק ${balance} שקלים`}>
            <Text style={styles.balanceText}>₪{balance}</Text>
          </View>
        ) : null}
      />
      <View style={styles.content}>
        {renderContent()}
      </View>

      {/* Bottom tab bar */}
      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
        {([
          { id: 'home', label: 'בית' },
          { id: 'results', label: 'תוצאות' },
          { id: 'orders', label: 'הזמנות' },
          { id: 'subscriptions', label: 'מנויים' },
          { id: 'wallet', label: 'ארנק' },
        ] as const).map(({ id, label }) => {
          const on = tab === id;
          return (
            <Pressable
              key={id}
              style={styles.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={id === 'home' && cartCount > 0 ? `${label}, ${cartCount} בעגלה` : label}
              onPress={() => {
                setTab(id);
                if (id !== 'orders') setSelectedOrderId(null);
                if (id !== 'home') { setHomeStep('select'); }
              }}
            >
              <View style={[styles.tabPill, on && styles.tabPillOn]}>
                <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{label}</Text>
                {id === 'home' && cartCount > 0 && (
                  <View style={styles.badge}><Text style={styles.badgeText}>{cartCount}</Text></View>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  content: { flex: 1 },
  balanceChip: {
    minHeight: 32, paddingHorizontal: 12, borderRadius: radii.pill,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', justifyContent: 'center',
  },
  balanceText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.brandInk, fontVariant: ['tabular-nums'] },
  tabBar: {
    flexDirection: rtl.row,
    backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.line,
    paddingTop: 6, paddingHorizontal: 6,
    ...shadows.bar,
  },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  tabPill: {
    flexDirection: rtl.row, alignItems: 'center', gap: 4,
    minHeight: 40, paddingHorizontal: 10, borderRadius: radii.pill,
  },
  tabPillOn: { backgroundColor: colors.pine },
  tabLabel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.pine },
  tabLabelOn: { fontFamily: fonts.bodyBold, color: colors.brandInk },
  badge: {
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5,
    backgroundColor: colors.sun, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bodyBold, color: colors.pineDeep, fontSize: 11 },
});
