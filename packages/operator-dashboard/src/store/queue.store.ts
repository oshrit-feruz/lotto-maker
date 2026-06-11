import { create } from 'zustand';
import type { QueueSlotWithOrder } from '../api/client.js';

type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

interface QueueStore {
  slots: QueueSlotWithOrder[];
  connectionStatus: ConnectionStatus;
  setSlots: (slots: QueueSlotWithOrder[]) => void;
  updateSlot: (slotId: string, update: Partial<QueueSlotWithOrder>) => void;
  removeSlot: (slotId: string) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
}

export const useQueueStore = create<QueueStore>((set) => ({
  slots: [],
  connectionStatus: 'disconnected',
  setSlots: (slots) => set({ slots }),
  updateSlot: (slotId, update) =>
    set((state) => ({
      slots: state.slots.map((s) => (s.id === slotId ? { ...s, ...update } : s)),
    })),
  removeSlot: (slotId) =>
    set((state) => ({ slots: state.slots.filter((s) => s.id !== slotId) })),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
}));
