import type { GameType } from './game.js';

export type OrderType = 'one_time' | 'subscription';

export type OrderStatus =
  | 'pending'
  | 'in_queue'
  | 'keyed'
  | 'scanned'
  | 'won'
  | 'lost'
  | 'refunded';

export interface Order {
  id: string;
  userId: string;
  subscriptionId: string | null;
  gameType: GameType;
  numbers: number[];
  strongNumber: number | null;
  drawDate: string;
  drawTime: string;
  type: OrderType;
  status: OrderStatus;
  ticketScanUrl: string | null;
  price: string;
  fee: string;
  totalCharged: string;
  createdAt: string;
  updatedAt: string;
  keyedAt: string | null;
  scannedAt: string | null;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'ממתין לאישור',
  in_queue: 'ממתין לתור',
  keyed: 'הוקלד',
  scanned: 'טופס מאושר',
  won: 'זכית!',
  lost: 'לא זכית',
  refunded: 'הוחזר',
};
