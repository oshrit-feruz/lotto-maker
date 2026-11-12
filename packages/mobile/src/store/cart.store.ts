import { create } from 'zustand';
import type { TicketPayload } from '../api/client.js';

/** A lotto ticket waiting in the cart. Prices come from /tickets/calculate; nothing is hard-coded. */
export interface CartItem {
  id: string;
  ticket: TicketPayload;
  type: 'one_time' | 'subscription';
  /** Pais price for all draws of this ticket. */
  price: number;
  /** Our fee for all draws of this ticket. */
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
