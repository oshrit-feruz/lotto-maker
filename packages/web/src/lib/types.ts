// Response shapes of the backend routes this site calls. Copied from
// packages/backend/src/modules/*; keep in sync when the backend changes.

export interface UpcomingDraw {
  gameType: string;
  drawNumber?: number;
  drawTime: string;
  salesCloseAt?: string;
  hardCutoff: string;
  /** Not returned yet: see the "next draw prize" gap in the README. */
  firstPrize?: string | null;
}

export interface LatestResult {
  drawNumber: number;
  gameType: string;
  winningNumbers: number[];
  strongNumber: number | null;
  drawDate: string;
  /** Not returned yet (gap): the draw's prize table. */
  prizeTiers?: PrizeTierView[];
}

export interface PrizeTierView {
  game: 'lotto' | 'double' | 'extra';
  tier: string;
  winnersCount: number;
  prizeAmount: string;
}

export interface Me {
  id: string;
  phone: string;
  fullName: string | null;
  verifiedAdult: boolean;
  walletBalance: string;
  status: string;
  idLast4: string | null;
  createdAt: string;
}

export interface CalculateResponse {
  type: 'regular' | 'double';
  tables: number;
  combinations: number;
  drawCount: number;
  perOrder: { paisPrice: string; extraPrice: string; fee: string; total: string };
  total: string;
  draws: { drawNumber: number; drawAt: string; salesCloseAt: string; orderCutoff: string }[];
  enoughDraws: boolean;
}

export interface DuplicateResponse {
  duplicate: boolean;
  drawNumbers: number[];
}

export interface CreateOrderResponse {
  ticketId: string;
  orderId: string;
  status: 'in_queue';
  totalCharged: string;
  drawTime: string;
  visibleCutoff: string;
  orders: { orderId: string; drawNumber: number; drawAt: string; visibleCutoff: string }[];
}

export interface CheckoutResponse {
  paymentId: string;
  checkoutUrl: string;
  status: 'pending' | 'approved' | 'failed' | 'refunded';
}

export interface PaymentView {
  paymentId: string;
  status: 'pending' | 'approved' | 'failed' | 'refunded';
  amount: string;
  cardLast4: string | null;
  createdAt: string;
}

export interface OrderView {
  id: string;
  status: string;
  drawDate: string;
  drawTime: string;
  price: string;
  fee: string;
  totalCharged: string;
  extraDigits: number[];
  hasScan: boolean;
  createdAt: string;
  ticket: {
    type: 'regular' | 'double';
    systematicType: string | null;
    extra: boolean;
    tables: { position: number; numbers: number[]; strongNumbers: number[] }[];
  } | null;
  draw: {
    drawNumber: number;
    drawAt: string;
    status: string;
    numbers: number[];
    strong: number | null;
    extraDigits: number[];
  } | null;
  wins: { game: string; tier: string; count: number; amount: string }[];
  prizeClaim: { status: string; amount: string } | null;
}

export interface Paged<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface WalletTransactionView {
  id: string;
  type: 'deposit' | 'charge' | 'refund' | 'winning' | 'refund_reversal' | string;
  amount: string;
  orderId: string | null;
  description: string;
  createdAt: string;
}

export type WithdrawalStatus = 'requested' | 'approved' | 'rejected' | 'paid' | 'failed' | 'cancelled';

export interface WithdrawalView {
  id: string;
  amount: string;
  fee: string;
  payout: string;
  method: 'card' | 'bank';
  status: WithdrawalStatus;
  savedCardId: string | null;
  bankAccountLast4: string | null;
  failureReason: string | null;
  decidedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface SavedCardView {
  id: string;
  last4: string;
  brand: string | null;
  isDefault: boolean;
}

/** GET /me/prize-claims (modules/prize-claims). */
export interface PrizeClaimView {
  id: string;
  orderId: string;
  amount: string;
  status: 'awaiting_pickup' | 'scheduled' | 'collected' | 'expired';
  scheduledAt: string | null;
  collectedAt: string | null;
  expiresAt: string;
  createdAt: string;
}
