export type WalletTransactionType = 'deposit' | 'charge' | 'refund' | 'winning';

export interface WalletTransaction {
  id: string;
  userId: string;
  type: WalletTransactionType;
  amount: string;
  orderId: string | null;
  description: string;
  createdAt: string;
}
