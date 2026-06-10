import { create } from 'zustand';
import type { GameType } from '@lotto-maker/shared';

export interface CartItem {
  id: string;
  gameType: GameType;
  numbers: number[];
  strongNumber?: number;
  type: 'one_time' | 'subscription';
  subscriptionDays?: string[];
  price: number;
  fee: number;
}

interface CartStore {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  clear: () => void;
  total: () => number;
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  addItem: (item) => set((s) => ({ items: [...s.items, item] })),
  removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  clear: () => set({ items: [] }),
  total: () => get().items.reduce((sum, i) => sum + i.price + i.fee, 0),
}));
