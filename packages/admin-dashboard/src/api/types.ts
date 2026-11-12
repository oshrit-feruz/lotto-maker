// Response shapes of the backend. Money (Prisma Decimal) is serialized as a string and dates as
// ISO strings.

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Draws ───────────────────────────────────────────────────────────────────

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
  /** Sent back as `expectedUpdatedAt` when confirming, so a changed draw is not confirmed. */
  updatedAt: string;
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

// ─── Prize claims ────────────────────────────────────────────────────────────

export type ClaimStatus = 'awaiting_pickup' | 'scheduled' | 'collected' | 'expired';

/** What collect and schedule return. */
export interface PrizeClaimView {
  id: string;
  orderId: string;
  amount: string;
  status: ClaimStatus;
  scheduledAt: string | null;
  collectedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

/** An item of GET /admin/prize-claims. */
export interface PrizeClaim extends PrizeClaimView {
  claimantName: string | null;
  claimantPhone: string;
  /**
   * Never shown and never used to prefill the collect input: the admin types the digits from the
   * physical ID card. The dashboard only uses it to enable the button; the server checks again.
   */
  claimantIdLast4: string | null;
  /** Same as scheduledAt. */
  scheduledFor: string | null;
  drawNumber: number | null;
}

// ─── Withdrawals ─────────────────────────────────────────────────────────────

export type WithdrawalStatus = 'requested' | 'approved' | 'rejected' | 'paid' | 'failed' | 'cancelled';
export type WithdrawalMethod = 'card' | 'bank';

export interface Withdrawal {
  id: string;
  userId: string;
  amount: string;
  fee: string;
  /** amount − fee: what the customer receives. */
  payout: string;
  method: WithdrawalMethod;
  status: WithdrawalStatus;
  savedCardId: string | null;
  bankAccountLast4: string | null;
  /** The reject reason, or why a payout failed. */
  failureReason: string | null;
  decidedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  adminId: string | null;
  bankReference: string | null;
  providerTxId: string | null;
}

export interface BankDetails {
  holderName: string;
  bankCode: string;
  branchCode: string;
  accountNumber: string;
}

/** GET /admin/withdrawals/:id/bank-details. Every call is audited. */
export interface WithdrawalWithBank extends Withdrawal {
  bank: BankDetails;
}

// ─── Card credits ────────────────────────────────────────────────────────────

export type CardCreditStatus = 'pending' | 'paid' | 'failed';

export interface CardCredit {
  id: string;
  orderId: string;
  userId: string;
  amount: string;
  status: CardCreditStatus;
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  providerTxId: string | null;
  paidAt: string | null;
  paidByAdminId: string | null;
  manualReference: string | null;
  createdAt: string;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export type UserStatus = 'active' | 'suspended';

export interface AdminUser {
  id: string;
  phone: string;
  fullName: string | null;
  walletBalance: string;
  /** Same value as walletBalance. */
  balance: string;
  status: UserStatus;
  verifiedAdult: boolean;
  idLast4: string | null;
  createdAt: string;
}

export interface UserOrder {
  id: string;
  status: string;
  total: string;
  drawNumber: number | null;
  createdAt: string;
}

export interface WalletTx {
  id: string;
  type: string;
  amount: string;
  description: string | null;
  createdAt: string;
}

export interface AdminUserDetail extends AdminUser {
  orders: UserOrder[];
  walletTransactions: WalletTx[];
}

/** Suspend / unsuspend. `changed` is false when the user already had that status. */
export type UserStatusChange = AdminUser & { changed: boolean };

// ─── Audit ───────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  orderId: string | null;
  actorType: string | null;
  actorId: string | null;
  adminPhone: string | null;
  adminName: string | null;
  metadata: unknown;
  createdAt: string;
}
