// Response shapes of the backend. Prisma Decimal fields are serialized as strings.

export type DrawStatus = 'scheduled' | 'results_suggested' | 'results_confirmed' | 'settled';
export type PrizeGame = 'lotto' | 'double' | 'extra';

export interface DrawSummary {
  id: string;
  drawNumber: number;
  drawAt: string;
  salesCloseAt: string;
  status: DrawStatus;
  suggestedAt: string | null;
  confirmedAt: string | null;
  settledAt: string | null;
  needsAttention: boolean;
  attentionReason: string | null;
}

export interface PrizeTier {
  id?: string;
  game: PrizeGame;
  tier: string;
  winnersCount: number;
  prizeAmount: string | number;
}

export interface DrawDetail extends DrawSummary {
  numbers: number[];
  strong: number | null;
  extraDigits: number[];
  prizeTiers: PrizeTier[];
}

export interface EditResultsBody {
  numbers: number[];
  strong: number;
  extraDigits: number[];
  prizeTiers: Array<{ game: PrizeGame; tier: string; winnersCount: number; prizeAmount: number }>;
}

// Claims. The backend currently supports only awaiting_pickup | collected and has no ID last-4,
// scheduling or user info; the optional fields below are the contract the UI codes against.
export type ClaimStatus = 'awaiting_pickup' | 'scheduled' | 'collected' | 'expired';

export interface PrizeClaim {
  id: string;
  orderId: string;
  userId: string;
  amount: string;
  status: ClaimStatus;
  createdAt: string;
  scheduledFor?: string | null;
  claimantIdLast4?: string | null;
  claimantPhone?: string | null;
  order?: { id: string; draw?: { drawNumber: number } };
}

export type WithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'paid';
export interface Withdrawal {
  id: string;
  userId: string;
  amount: string;
  status: WithdrawalStatus;
  method?: 'bank' | 'card' | string;
  createdAt: string;
  rejectReason?: string | null;
  reference?: string | null;
  user?: { phone: string };
}

export type CardCreditStatus = 'pending' | 'paid';
export interface CardCredit {
  id: string;
  orderId: string;
  userId: string;
  amount: string;
  status: CardCreditStatus;
  createdAt: string;
  user?: { phone: string };
}

export interface AdminUser {
  id: string;
  phone: string;
  status: 'active' | 'suspended' | string;
  balance: string;
  verifiedAdult: boolean;
  idLast4: string | null;
  createdAt?: string;
}
export interface UserOrder {
  id: string;
  total?: string;
  status: string;
  createdAt: string;
}
export interface WalletTx {
  id: string;
  type: string;
  amount: string;
  createdAt: string;
}
export interface AdminUserDetail extends AdminUser {
  orders: UserOrder[];
  walletTransactions: WalletTx[];
}

export interface AuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string | null;
  actorType: string | null;
  metadata: unknown;
  createdAt: string;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
