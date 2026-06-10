import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (hoisted so vi.mock factory can reference them) ────────────────────

const mockSendEachForMulticast = vi.hoisted(() => vi.fn());
const mockInitializeApp = vi.hoisted(() => vi.fn());
const mockCert = vi.hoisted(() => vi.fn());

vi.mock('firebase-admin', () => ({
  default: {
    apps: [],
    initializeApp: mockInitializeApp,
    messaging: () => ({ sendEachForMulticast: mockSendEachForMulticast }),
    credential: { cert: mockCert },
  },
}));

const mockFindMany = vi.hoisted(() => vi.fn());
const mockDeleteMany = vi.hoisted(() => vi.fn());

vi.mock('../../src/prisma.js', () => ({
  prisma: {
    deviceToken: {
      findMany: mockFindMany,
      deleteMany: mockDeleteMany,
    },
  },
}));

// ─── Imports (after mock declarations) ────────────────────────────────────────

import { notificationService, PAYLOADS } from '../../src/services/notifications.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSuccessResponse() {
  return { success: true, error: undefined };
}

function makeStaleResponse() {
  return {
    success: false,
    error: { code: 'messaging/registration-token-not-registered' },
  };
}

function makeOtherErrorResponse() {
  return {
    success: false,
    error: { code: 'messaging/internal-error' },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NotificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteMany.mockResolvedValue({ count: 0 });
  });

  // ─── sendToUser ──────────────────────────────────────────────────────────────

  describe('sendToUser', () => {
    it('returns silently when user has no device tokens', async () => {
      mockFindMany.mockResolvedValue([]);

      await notificationService.sendToUser('user-1', PAYLOADS.orderLost());

      expect(mockSendEachForMulticast).not.toHaveBeenCalled();
    });

    it('calls sendEachForMulticast with the correct payload', async () => {
      mockFindMany.mockResolvedValue([{ token: 'token-abc' }]);
      mockSendEachForMulticast.mockResolvedValue({
        responses: [makeSuccessResponse()],
        successCount: 1,
        failureCount: 0,
      });

      const payload = PAYLOADS.orderWon('100.00');
      await notificationService.sendToUser('user-1', payload);

      expect(mockSendEachForMulticast).toHaveBeenCalledOnce();
      expect(mockSendEachForMulticast).toHaveBeenCalledWith(
        expect.objectContaining({
          tokens: ['token-abc'],
          notification: { title: payload.title, body: payload.body },
          data: { type: 'ORDER_WON' },
        }),
      );
    });

    it('does not throw when sendEachForMulticast rejects', async () => {
      mockFindMany.mockResolvedValue([{ token: 'token-abc' }]);
      mockSendEachForMulticast.mockRejectedValue(new Error('FCM unavailable'));

      await expect(
        notificationService.sendToUser('user-1', PAYLOADS.orderLost()),
      ).resolves.toBeUndefined();
    });
  });

  // ─── Stale token cleanup ──────────────────────────────────────────────────────

  describe('stale token cleanup', () => {
    it('deletes a token that FCM reports as registration-not-registered', async () => {
      mockFindMany.mockResolvedValue([
        { token: 'good-token' },
        { token: 'stale-token' },
      ]);
      mockSendEachForMulticast.mockResolvedValue({
        responses: [makeSuccessResponse(), makeStaleResponse()],
        successCount: 1,
        failureCount: 1,
      });

      await notificationService.sendToUser('user-1', PAYLOADS.orderLost());

      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { token: { in: ['stale-token'] } },
      });
    });

    it('does not call deleteMany when all tokens succeed', async () => {
      mockFindMany.mockResolvedValue([{ token: 'good-token' }]);
      mockSendEachForMulticast.mockResolvedValue({
        responses: [makeSuccessResponse()],
        successCount: 1,
        failureCount: 0,
      });

      await notificationService.sendToUser('user-1', PAYLOADS.orderLost());

      expect(mockDeleteMany).not.toHaveBeenCalled();
    });

    it('does not delete tokens with non-stale FCM errors', async () => {
      mockFindMany.mockResolvedValue([{ token: 'token-with-other-error' }]);
      mockSendEachForMulticast.mockResolvedValue({
        responses: [makeOtherErrorResponse()],
        successCount: 0,
        failureCount: 1,
      });

      await notificationService.sendToUser('user-1', PAYLOADS.orderLost());

      expect(mockDeleteMany).not.toHaveBeenCalled();
    });
  });

  // ─── sendToMany + batching ────────────────────────────────────────────────────

  describe('sendToMany', () => {
    it('returns silently for empty userIds array', async () => {
      await notificationService.sendToMany([], PAYLOADS.orderLost());
      expect(mockFindMany).not.toHaveBeenCalled();
      expect(mockSendEachForMulticast).not.toHaveBeenCalled();
    });

    it('batches tokens into chunks of 500', async () => {
      // 501 tokens → 2 calls: 500 + 1
      const tokens = Array.from({ length: 501 }, (_, i) => ({ token: `token-${i}` }));
      mockFindMany.mockResolvedValue(tokens);
      mockSendEachForMulticast.mockResolvedValue({
        responses: Array(500).fill(makeSuccessResponse()),
        successCount: 500,
        failureCount: 0,
      });

      await notificationService.sendToMany(['user-1'], PAYLOADS.resultsDelayed());

      expect(mockSendEachForMulticast).toHaveBeenCalledTimes(2);

      const firstCall = mockSendEachForMulticast.mock.calls[0]![0];
      const secondCall = mockSendEachForMulticast.mock.calls[1]![0];
      expect(firstCall.tokens).toHaveLength(500);
      expect(secondCall.tokens).toHaveLength(1);
    });

    it('sends to all tokens across multiple users', async () => {
      mockFindMany.mockResolvedValue([
        { token: 'u1-token' },
        { token: 'u2-token' },
      ]);
      mockSendEachForMulticast.mockResolvedValue({
        responses: [makeSuccessResponse(), makeSuccessResponse()],
        successCount: 2,
        failureCount: 0,
      });

      await notificationService.sendToMany(['user-1', 'user-2'], PAYLOADS.orderKeyed());

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: { in: ['user-1', 'user-2'] } },
        }),
      );
      expect(mockSendEachForMulticast).toHaveBeenCalledOnce();
    });
  });

  // ─── PAYLOADS ─────────────────────────────────────────────────────────────────

  describe('PAYLOADS', () => {
    it('orderWon includes win amount in body', () => {
      const p = PAYLOADS.orderWon('250.00');
      expect(p.body).toContain('250.00');
      expect(p.data?.type).toBe('ORDER_WON');
    });

    it('subscriptionInsufficientFunds includes gameType in body', () => {
      const p = PAYLOADS.subscriptionInsufficientFunds('lotto');
      expect(p.body).toContain('lotto');
      expect(p.title).toContain('יתרה');
    });

    it('subscriptionCapacityExceeded includes gameType in body', () => {
      const p = PAYLOADS.subscriptionCapacityExceeded('seven77');
      expect(p.body).toContain('seven77');
      expect(p.title).toContain('תור');
    });
  });
});
