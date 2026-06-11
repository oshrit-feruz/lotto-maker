import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

// ─── Mocks (hoisted so vi.mock factory can reference them) ────────────────────

const mockFindManySubscriptions = vi.hoisted(() => vi.fn());
const mockFindFirstEvent = vi.hoisted(() => vi.fn());
const mockCreateEvent = vi.hoisted(() => vi.fn());

vi.mock('../../src/prisma.js', () => ({
  prisma: {
    subscription: { findMany: mockFindManySubscriptions },
    subscriptionEvent: {
      findFirst: mockFindFirstEvent,
      create: mockCreateEvent,
    },
  },
}));

const mockCreateOrder = vi.hoisted(() => vi.fn());
vi.mock('../../src/modules/orders/orders.service.js', () => ({
  createOrder: mockCreateOrder,
}));

const mockSendToUser = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/notifications.js', () => ({
  notificationService: { sendToUser: mockSendToUser },
  PAYLOADS: {
    subscriptionInsufficientFunds: (gameType: string) => ({
      title: 'מנוי לוטו — יתרה נמוכה',
      body: `יתרה נמוכה ל-${gameType}`,
      data: { type: 'SUBSCRIPTION_INSUFFICIENT_FUNDS' },
    }),
    subscriptionCapacityExceeded: (gameType: string) => ({
      title: 'מנוי לוטו — התור מלא',
      body: `תור מלא ל-${gameType}`,
      data: { type: 'SUBSCRIPTION_CAPACITY_EXCEEDED' },
    }),
  },
}));

// ─── Imports (after mock declarations) ────────────────────────────────────────

import { processSubscriptionsForGame, runSubscriptionCron } from '../../src/services/subscription-scheduler.js';
import { AppError } from '../../src/plugins/error-handler.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DRAW_DATE = new Date('2025-01-07T19:00:00Z'); // Lotto draw on a Tuesday
const DRAW_DAY = 'tue' as const;

function makeSub(overrides: Partial<{
  id: string;
  userId: string;
  gameType: string;
  numbers: number[];
  strongNumber: number | null;
  verifiedAdult: boolean;
  userStatus: string;
}> = {}) {
  const {
    id = 'sub-1',
    userId = 'user-1',
    gameType = 'lotto',
    numbers = [1, 2, 3, 4, 5, 6],
    strongNumber = 3,
    verifiedAdult = true,
    userStatus = 'active',
  } = overrides;
  return {
    id,
    userId,
    gameType,
    numbers,
    strongNumber,
    drawDays: [DRAW_DAY],
    active: true,
    user: { verifiedAdult, status: userStatus },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('processSubscriptionsForGame', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no existing event (not yet processed)
    mockFindFirstEvent.mockResolvedValue(null);
    // Default: createOrder succeeds
    mockCreateOrder.mockResolvedValue({ orderId: 'order-1', status: 'in_queue', totalCharged: '8.40' });
    // Default: event creation succeeds
    mockCreateEvent.mockResolvedValue({ id: 'evt-1' });
    // Default: sendToUser is silent
    mockSendToUser.mockResolvedValue(undefined);
  });

  // ─── Happy path ─────────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('calls createOrder with the subscription numbers', async () => {
      mockFindManySubscriptions.mockResolvedValue([makeSub()]);

      await processSubscriptionsForGame('lotto', DRAW_DATE, DRAW_DAY);

      expect(mockCreateOrder).toHaveBeenCalledOnce();
      expect(mockCreateOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          gameType: 'lotto',
          numbers: [1, 2, 3, 4, 5, 6],
          strongNumber: 3,
          type: 'subscription',
          subscriptionId: 'sub-1',
        }),
      );
    });

    it('records a success SubscriptionEvent with the returned orderId', async () => {
      mockFindManySubscriptions.mockResolvedValue([makeSub()]);

      await processSubscriptionsForGame('lotto', DRAW_DATE, DRAW_DAY);

      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subscriptionId: 'sub-1',
            orderId: 'order-1',
            drawDate: DRAW_DATE,
            status: 'success',
          }),
        }),
      );
    });

    it('does NOT notify the user on success', async () => {
      mockFindManySubscriptions.mockResolvedValue([makeSub()]);
      await processSubscriptionsForGame('lotto', DRAW_DATE, DRAW_DAY);
      expect(mockSendToUser).not.toHaveBeenCalled();
    });
  });

  // ─── Insufficient balance ────────────────────────────────────────────────────

  describe('insufficient balance', () => {
    beforeEach(() => {
      mockFindManySubscriptions.mockResolvedValue([makeSub()]);
      mockCreateOrder.mockRejectedValue(new AppError(402, 'INSUFFICIENT_BALANCE'));
    });

    it('records a skipped event with reason insufficient_funds', async () => {
      await processSubscriptionsForGame('lotto', DRAW_DATE, DRAW_DAY);

      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'skipped',
            skipReason: 'insufficient_funds',
          }),
        }),
      );
    });

    it('does NOT call createOrder a second time', async () => {
      await processSubscriptionsForGame('lotto', DRAW_DATE, DRAW_DAY);
      expect(mockCreateOrder).toHaveBeenCalledOnce();
    });

    it('notifies the user about the balance problem', async () => {
      await processSubscriptionsForGame('lotto', DRAW_DATE, DRAW_DAY);
      expect(mockSendToUser).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ title: expect.stringContaining('יתרה') }),
      );
    });
  });

  // ─── Circuit breaker full ────────────────────────────────────────────────────

  describe('circuit breaker full', () => {
    beforeEach(() => {
      mockFindManySubscriptions.mockResolvedValue([makeSub()]);
    });

    it.each([
      ['QUEUE_FULL'],
      ['NO_OPERATORS'],
      ['NO_ACTIVE_LOCATIONS'],
      ['CUTOFF_PASSED'],
    ])('records skipped/capacity_exceeded for AppError code %s', async (code) => {
      mockCreateOrder.mockRejectedValue(new AppError(503, code));

      await processSubscriptionsForGame('lotto', DRAW_DATE, DRAW_DAY);

      expect(mockCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'skipped',
            skipReason: 'capacity_exceeded',
          }),
        }),
      );
    });

    it('notifies the user about the capacity problem', async () => {
      mockCreateOrder.mockRejectedValue(new AppError(503, 'QUEUE_FULL'));

      await processSubscriptionsForGame('lotto', DRAW_DATE, DRAW_DAY);

      expect(mockSendToUser).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ title: expect.stringContaining('תור') }),
      );
    });
  });

  // ─── Idempotency ─────────────────────────────────────────────────────────────

  describe('idempotency', () => {
    it('skips if a SubscriptionEvent already exists for this draw', async () => {
      mockFindManySubscriptions.mockResolvedValue([makeSub()]);
      mockFindFirstEvent.mockResolvedValue({ id: 'evt-existing', status: 'success' });

      await processSubscriptionsForGame('lotto', DRAW_DATE, DRAW_DAY);

      expect(mockCreateOrder).not.toHaveBeenCalled();
      expect(mockCreateEvent).not.toHaveBeenCalled();
    });

    it('creates exactly one order when called twice for the same draw', async () => {
      mockFindManySubscriptions.mockResolvedValue([makeSub()]);

      // First call: no existing event
      mockFindFirstEvent.mockResolvedValueOnce(null);
      await processSubscriptionsForGame('lotto', DRAW_DATE, DRAW_DAY);

      // Second call: event now exists (set up mock to reflect state)
      mockFindFirstEvent.mockResolvedValueOnce({ id: 'evt-1', status: 'success' });
      await processSubscriptionsForGame('lotto', DRAW_DATE, DRAW_DAY);

      expect(mockCreateOrder).toHaveBeenCalledOnce();
    });

    it('handles a concurrent-insert P2002 unique violation gracefully', async () => {
      mockFindManySubscriptions.mockResolvedValue([makeSub()]);
      mockFindFirstEvent.mockResolvedValue(null); // both "threads" pass the check

      const uniqueViolation = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      mockCreateEvent.mockRejectedValue(uniqueViolation);

      // Should NOT throw
      await expect(
        processSubscriptionsForGame('lotto', DRAW_DATE, DRAW_DAY),
      ).resolves.toBeUndefined();
    });
  });

  // ─── KYC guard ───────────────────────────────────────────────────────────────

  describe('KYC not verified', () => {
    it('skips the subscription without calling createOrder', async () => {
      mockFindManySubscriptions.mockResolvedValue([makeSub({ verifiedAdult: false })]);

      await processSubscriptionsForGame('lotto', DRAW_DATE, DRAW_DAY);

      expect(mockCreateOrder).not.toHaveBeenCalled();
    });

    it('does NOT create a SubscriptionEvent for a KYC-skipped subscription', async () => {
      mockFindManySubscriptions.mockResolvedValue([makeSub({ verifiedAdult: false })]);

      await processSubscriptionsForGame('lotto', DRAW_DATE, DRAW_DAY);

      expect(mockCreateEvent).not.toHaveBeenCalled();
    });

    it('does NOT notify the user (KYC is a config issue, not a per-draw alert)', async () => {
      mockFindManySubscriptions.mockResolvedValue([makeSub({ verifiedAdult: false })]);

      await processSubscriptionsForGame('lotto', DRAW_DATE, DRAW_DAY);

      expect(mockSendToUser).not.toHaveBeenCalled();
    });
  });

  // ─── Multiple subscriptions ───────────────────────────────────────────────────

  describe('multiple subscriptions', () => {
    it('processes all subscriptions independently', async () => {
      mockFindManySubscriptions.mockResolvedValue([
        makeSub({ id: 'sub-1', userId: 'user-1' }),
        makeSub({ id: 'sub-2', userId: 'user-2' }),
      ]);

      await processSubscriptionsForGame('lotto', DRAW_DATE, DRAW_DAY);

      expect(mockCreateOrder).toHaveBeenCalledTimes(2);
    });

    it('continues processing when one subscription fails', async () => {
      mockFindManySubscriptions.mockResolvedValue([
        makeSub({ id: 'sub-1', userId: 'user-1' }),
        makeSub({ id: 'sub-2', userId: 'user-2' }),
      ]);

      // First subscription throws balance error, second succeeds
      (mockCreateOrder as Mock)
        .mockRejectedValueOnce(new AppError(402, 'INSUFFICIENT_BALANCE'))
        .mockResolvedValueOnce({ orderId: 'order-2', status: 'in_queue', totalCharged: '8.40' });

      await processSubscriptionsForGame('lotto', DRAW_DATE, DRAW_DAY);

      expect(mockCreateOrder).toHaveBeenCalledTimes(2);
      expect(mockCreateEvent).toHaveBeenCalledTimes(2);
    });
  });

  // ─── No subscriptions ─────────────────────────────────────────────────────────

  it('completes silently when there are no active subscriptions', async () => {
    mockFindManySubscriptions.mockResolvedValue([]);

    await expect(
      processSubscriptionsForGame('lotto', DRAW_DATE, DRAW_DAY),
    ).resolves.toBeUndefined();

    expect(mockCreateOrder).not.toHaveBeenCalled();
  });
});

// ─── runSubscriptionCron ───────────────────────────────────────────────────────

describe('runSubscriptionCron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirstEvent.mockResolvedValue(null);
    mockCreateOrder.mockResolvedValue({ orderId: 'order-x', status: 'in_queue', totalCharged: '8.40' });
    mockCreateEvent.mockResolvedValue({ id: 'evt-x' });
    mockFindManySubscriptions.mockResolvedValue([]);
  });

  it('does nothing on a non-draw day (e.g. Monday)', async () => {
    // Monday Jan 6 2025 in any timezone is still Monday
    const monday = new Date('2025-01-06T10:00:00Z'); // Monday UTC
    await runSubscriptionCron(monday);
    expect(mockFindManySubscriptions).not.toHaveBeenCalled();
  });

  it('processes subscriptions on a draw day (Tuesday)', async () => {
    // Tuesday Jan 7 2025 at 15:45 Israel time = 13:45 UTC
    const tuesday = new Date('2025-01-07T13:45:00Z');
    mockFindManySubscriptions.mockResolvedValue([makeSub()]);

    await runSubscriptionCron(tuesday);

    // findMany should have been called for each game type
    expect(mockFindManySubscriptions).toHaveBeenCalled();
  });
});
