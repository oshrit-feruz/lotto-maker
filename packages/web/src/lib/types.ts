// Response shapes of the backend routes this site calls. Copied from
// packages/backend/src/modules/*; keep in sync when the backend changes.

/** GET /draws/next (public): the next lotto draw open for orders. 404 NO_OPEN_DRAW when there is none. */
export interface NextDraw {
  id: string;
  gameType: 'lotto';
  drawNumber: number;
  drawAt: string;
  salesCloseAt: string;
  /** Last moment an order is accepted. */
  hardCutoff: string;
  /** The earlier cutoff shown to users. */
  visibleCutoff: string;
  /** Announced first prize in ILS ("5000000.00"), null if not announced. */
  firstPrize: string | null;
  /** Announced double-lotto first prize in ILS, null if not announced. */
  doublePrize: string | null;
}

/** GET /results/latest?game=lotto (public). 404 RESULTS_NOT_AVAILABLE before the first confirmed draw. */
export interface LottoResult {
  drawId: string;
  gameType: 'lotto';
  drawNumber: number;
  drawAt: string;
  status: string;
  confirmedAt: string | null;
  numbers: number[];
  strong: number | null;
  extraDigits: number[];
  /** All three tables, best tier first. */
  prizeTiers: PrizeTierView[];
  prizes?: Record<'lotto' | 'double' | 'extra', Omit<PrizeTierView, 'game'>[]>;
}

/** One row of GET /prices. */
export interface PriceRowView {
  pricePerTable: string;
  /** Null: Extra cannot be added to this ticket type. */
  extraPricePerForm: string | null;
  feePerOrder: string;
  effectiveFrom: string;
}

/** GET /prices (public). */
export interface PricesResponse {
  currency: 'ILS';
  regular: PriceRowView | null;
  double: PriceRowView | null;
}

/** GET /wallet/withdrawals/quote?amount=&method= */
export interface WithdrawalQuote {
  amount: string;
  method: 'card' | 'bank';
  fee: string;
  net: string;
  min: string;
  belowMinimum: boolean;
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
  status: string;
  totalCharged: string;
  drawTime: string;
  visibleCutoff: string;
  orders: { orderId: string; drawNumber: number; drawAt: string; visibleCutoff: string }[];
  /** True when the backend answered a repeat of an earlier request with the same Idempotency-Key. */
  replayed?: boolean;
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
