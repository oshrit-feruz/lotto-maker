import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = vi.hoisted(() => ({
  operatorFindUnique: vi.fn(),
  slotFindUnique: vi.fn(),
  slotFindUniqueOrThrow: vi.fn(),
  slotFindMany: vi.fn(),
  slotUpdateMany: vi.fn(),
  orderUpdateMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock('../../src/prisma.js', () => {
  const prisma: any = {
    operator: { findUnique: db.operatorFindUnique, findUniqueOrThrow: db.operatorFindUnique },
    queueSlot: {
      findUnique: db.slotFindUnique,
      findUniqueOrThrow: db.slotFindUniqueOrThrow,
      findMany: db.slotFindMany,
      updateMany: db.slotUpdateMany,
    },
    order: { updateMany: db.orderUpdateMany },
    auditLog: { create: db.auditCreate },
  };
  prisma.$transaction = (fn: (tx: any) => Promise<unknown>) => fn(prisma);
  return { prisma };
});

const mockPublish = vi.hoisted(() => vi.fn());
vi.mock('../../src/redis.js', () => ({ redis: { publish: mockPublish } }));

const mockSendToUser = vi.hoisted(() => vi.fn());
vi.mock('../../src/services/notifications.js', () => ({
  notificationService: { sendToUser: mockSendToUser },
  PAYLOADS: { orderKeyed: () => ({ title: 't', body: 'b' }) },
}));

const mockUpload = vi.hoisted(() => vi.fn());
vi.mock('../../src/storage/r2.service.js', () => ({ r2Service: { upload: mockUpload } }));

import {
  attachScan,
  completeSlot,
  getQueue,
  startSlot,
} from '../../src/modules/operators/operators.service.js';
import { config } from '../../src/config.js';
import errorHandler from '../../src/plugins/error-handler.js';
import authPlugin from '../../src/plugins/auth.js';
import operatorsRoutes from '../../src/modules/operators/operators.routes.js';

const OPERATOR = { id: 'op-1', locationId: 'loc-A', active: true };

function slot(overrides: Record<string, unknown> = {}, orderStatus = 'in_queue') {
  return {
    id: 'slot-1',
    orderId: 'order-1',
    operatorId: null,
    locationId: 'loc-A',
    status: 'waiting',
    order: { status: orderStatus, userId: 'user-1' },
    ...overrides,
  };
}

const auditActions = () => db.auditCreate.mock.calls.map((c) => c[0].data.action as string);
const expectNothingWritten = () => {
  expect(db.slotUpdateMany).not.toHaveBeenCalled();
  expect(db.orderUpdateMany).not.toHaveBeenCalled();
  expect(db.auditCreate).not.toHaveBeenCalled();
  expect(mockPublish).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.clearAllMocks();
  db.operatorFindUnique.mockResolvedValue(OPERATOR);
  db.slotUpdateMany.mockResolvedValue({ count: 1 });
  db.orderUpdateMany.mockResolvedValue({ count: 1 });
  db.slotFindUniqueOrThrow.mockImplementation(async () => ({ id: 'slot-1', status: 'updated' }));
  mockSendToUser.mockResolvedValue(undefined);
  mockUpload.mockImplementation(async (key: string) => key);
});

describe('operators may only act on slots in their own location', () => {
  const foreign = () => slot({ locationId: 'loc-B', status: 'in_progress' });
  const cases: Array<[string, () => Promise<unknown>]> = [
    ['startSlot', () => startSlot('slot-1', 'op-1')],
    ['completeSlot', () => completeSlot('slot-1', 'op-1')],
    ['attachScan', () => attachScan('slot-1', 'op-1', 'scans/x.jpg')],
  ];

  it.each(cases)('%s rejects a slot from another location with 403 FORBIDDEN_LOCATION', async (_name, act) => {
    db.slotFindUnique.mockResolvedValue(foreign());
    await expect(act()).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN_LOCATION' });
    expectNothingWritten();
  });

  it.each(cases)('%s rejects a deactivated or unknown operator', async (_name, act) => {
    db.slotFindUnique.mockResolvedValue(slot());
    db.operatorFindUnique.mockResolvedValue({ ...OPERATOR, active: false });
    await expect(act()).rejects.toMatchObject({ statusCode: 403, code: 'OPERATOR_INACTIVE' });
    db.operatorFindUnique.mockResolvedValue(null);
    await expect(act()).rejects.toMatchObject({ statusCode: 403 });
    expectNothingWritten();
  });

  it.each(cases)('%s returns 404 for an unknown slot', async (_name, act) => {
    db.slotFindUnique.mockResolvedValue(null);
    await expect(act()).rejects.toMatchObject({ statusCode: 404, code: 'SLOT_NOT_FOUND' });
    expectNothingWritten();
  });
});

describe('startSlot', () => {
  it('moves the slot to in_progress without touching the order, and logs exactly that', async () => {
    db.slotFindUnique.mockResolvedValue(slot());
    await startSlot('slot-1', 'op-1');

    expect(db.slotUpdateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: 'slot-1', status: 'waiting' },
      data: { status: 'in_progress', operatorId: 'op-1' },
    });
    expect(db.orderUpdateMany).not.toHaveBeenCalled();

    expect(auditActions()).toEqual(['slot_status_change:waiting->in_progress']);
    expect(auditActions().join()).not.toContain('keyed');
    expect(db.auditCreate.mock.calls[0]![0].data).toMatchObject({
      entityType: 'queue_slot',
      entityId: 'slot-1',
      orderId: 'order-1',
      actorId: 'op-1',
    });
  });

  it('is a no-op when this operator already started the slot', async () => {
    db.slotFindUnique.mockResolvedValue(slot({ status: 'in_progress', operatorId: 'op-1' }));
    await expect(startSlot('slot-1', 'op-1')).resolves.toMatchObject({ status: 'in_progress' });
    expectNothingWritten();
  });

  it.each(['done', 'failed'])('rejects a %s slot', async (status) => {
    db.slotFindUnique.mockResolvedValue(slot({ status }));
    await expect(startSlot('slot-1', 'op-1')).rejects.toMatchObject({ statusCode: 409, code: 'SLOT_NOT_ACTIONABLE' });
    expectNothingWritten();
  });

  describe('a slot another operator is working on', () => {
    const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

    it('is rejected with 409 SLOT_TAKEN while the claim is fresh', async () => {
      db.slotFindUnique.mockResolvedValue(
        slot({ status: 'in_progress', operatorId: 'op-2', assignedAt: minutesAgo(2) }),
      );
      await expect(startSlot('slot-1', 'op-1')).rejects.toMatchObject({ statusCode: 409, code: 'SLOT_TAKEN' });
      expectNothingWritten();
    });

    it('can be taken over once the claim is older than SLOT_CLAIM_TIMEOUT_MINUTES, and logs the previous operator', async () => {
      db.slotFindUnique.mockResolvedValue(
        slot({ status: 'in_progress', operatorId: 'op-2', assignedAt: minutesAgo(config.SLOT_CLAIM_TIMEOUT_MINUTES + 1) }),
      );
      await startSlot('slot-1', 'op-1');

      expect(db.slotUpdateMany.mock.calls[0]![0]).toMatchObject({
        where: { id: 'slot-1', status: 'in_progress', operatorId: 'op-2' },
        data: { status: 'in_progress', operatorId: 'op-1' },
      });
      expect(db.auditCreate.mock.calls[0]![0].data).toMatchObject({
        action: 'slot_status_change:in_progress->in_progress',
        actorId: 'op-1',
        metadata: { previousOperatorId: 'op-2' },
      });
    });
  });

  it('rejects when the slot changed underneath (lost race)', async () => {
    db.slotFindUnique.mockResolvedValue(slot());
    db.slotUpdateMany.mockResolvedValue({ count: 0 });
    await expect(startSlot('slot-1', 'op-1')).rejects.toMatchObject({ statusCode: 409 });
    expect(db.auditCreate).not.toHaveBeenCalled();
  });
});

describe('completeSlot', () => {
  it('marks the slot done and only then the order keyed', async () => {
    db.slotFindUnique.mockResolvedValue(slot({ status: 'in_progress', operatorId: 'op-1' }));
    await completeSlot('slot-1', 'op-1');

    expect(db.slotUpdateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: 'slot-1', status: 'in_progress', operatorId: 'op-1' },
      data: { status: 'done' },
    });
    expect(db.orderUpdateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: 'order-1', status: 'in_queue' },
      data: { status: 'keyed' },
    });
    expect(auditActions()).toEqual(['slot_status_change:in_progress->done', 'status_change:in_queue->keyed']);
  });

  it('rejects with 409 SLOT_TAKEN when another operator holds the slot', async () => {
    db.slotFindUnique.mockResolvedValue(slot({ status: 'in_progress', operatorId: 'op-2' }));
    await expect(completeSlot('slot-1', 'op-1')).rejects.toMatchObject({ statusCode: 409, code: 'SLOT_TAKEN' });
    expectNothingWritten();
  });

  it('rejects with 409 SLOT_TAKEN when the claim changed between the read and the update', async () => {
    db.slotFindUnique.mockResolvedValue(slot({ status: 'in_progress', operatorId: 'op-1' }));
    db.slotUpdateMany.mockResolvedValue({ count: 0 });
    await expect(completeSlot('slot-1', 'op-1')).rejects.toMatchObject({ statusCode: 409, code: 'SLOT_TAKEN' });
    expect(db.orderUpdateMany).not.toHaveBeenCalled();
  });

  it.each(['waiting', 'done', 'failed'])('rejects a %s slot', async (status) => {
    db.slotFindUnique.mockResolvedValue(slot({ status }));
    await expect(completeSlot('slot-1', 'op-1')).rejects.toMatchObject({ statusCode: 409, code: 'SLOT_NOT_IN_PROGRESS' });
    expectNothingWritten();
  });

  it('rejects when the order is not in the queue (e.g. refunded)', async () => {
    db.slotFindUnique.mockResolvedValue(slot({ status: 'in_progress', operatorId: 'op-1' }, 'refunded'));
    await expect(completeSlot('slot-1', 'op-1')).rejects.toMatchObject({ statusCode: 409, code: 'ORDER_NOT_IN_QUEUE' });
    expectNothingWritten();
  });
});

describe('attachScan', () => {
  it('stores the scan key and marks the order scanned once the form is keyed', async () => {
    db.slotFindUnique.mockResolvedValue(slot({ status: 'done' }, 'keyed'));
    await expect(attachScan('slot-1', 'op-1', 'scans/slot-1.jpg')).resolves.toEqual({ scanned: true });

    expect(db.orderUpdateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: 'order-1', status: 'keyed' },
      data: { ticketScanKey: 'scans/slot-1.jpg', status: 'scanned' },
    });
    expect(auditActions()).toEqual(['status_change:keyed->scanned']);
    // The queue event carries no URL or key
    expect(mockPublish.mock.calls[0]![1]).toBe(JSON.stringify({ type: 'slot_scanned', slotId: 'slot-1' }));
  });

  it.each(['waiting', 'in_progress', 'failed'])('rejects while the slot is %s (not keyed yet)', async (status) => {
    db.slotFindUnique.mockResolvedValue(slot({ status }, 'in_queue'));
    await expect(attachScan('slot-1', 'op-1', 'scans/x.jpg')).rejects.toMatchObject({ statusCode: 409, code: 'SLOT_NOT_KEYED' });
    expectNothingWritten();
  });

  it.each(['in_queue', 'scanned', 'won', 'refunded'])('rejects when the order is %s instead of keyed', async (orderStatus) => {
    db.slotFindUnique.mockResolvedValue(slot({ status: 'done' }, orderStatus));
    await expect(attachScan('slot-1', 'op-1', 'scans/x.jpg')).rejects.toMatchObject({ statusCode: 409, code: 'ORDER_NOT_KEYED' });
    expectNothingWritten();
  });
});

describe('getQueue payload', () => {
  it('contains the numbers and the ID last 4 digits, and nothing else about the user', async () => {
    db.slotFindMany.mockResolvedValue([
      {
        id: 'slot-1',
        orderId: 'order-1',
        locationId: 'loc-A',
        status: 'waiting',
        deadline: new Date('2026-01-01T10:00:00Z'),
        order: {
          gameType: 'lotto',
          numbers: [1, 2, 3, 4, 5, 6],
          strongNumber: 3,
          type: 'one_time',
          user: { idLast4: '6782' },
        },
      },
    ]);

    const { slots } = await getQueue('loc-A');
    expect(slots[0]!.order).toEqual({
      gameType: 'lotto',
      numbers: [1, 2, 3, 4, 5, 6],
      strongNumber: 3,
      type: 'one_time',
      idLast4: '6782',
    });
    expect(JSON.stringify(slots)).not.toContain('userId');

    // The query itself asks for nothing more than idLast4 from the user
    const { where, include } = db.slotFindMany.mock.calls[0]![0];
    expect(where.locationId).toBe('loc-A');
    expect(include.order.select).not.toHaveProperty('userId');
    expect(include.order.select.user).toEqual({ select: { idLast4: true } });
  });
});

describe('POST /operator/queue/:slotId/scan', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(errorHandler);
    await app.register(authPlugin);
    await app.register(multipart);
    await app.register(operatorsRoutes);
    await app.ready();
  });
  afterEach(() => app.close());

  function upload() {
    const boundary = '----TestBoundary';
    const payload = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="image"; filename="scan.jpg"',
      'Content-Type: image/jpeg',
      '',
      'fake-image-bytes',
      `--${boundary}--`,
    ].join('\r\n');
    return app.inject({
      method: 'POST',
      url: '/operator/queue/slot-1/scan',
      headers: {
        authorization: `Bearer ${app.jwt.sign({ sub: 'op-1', type: 'operator' })}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
  }

  it('uploads nothing when the slot belongs to another location', async () => {
    db.slotFindUnique.mockResolvedValue(slot({ locationId: 'loc-B', status: 'done' }, 'keyed'));
    const res = await upload();
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN_LOCATION');
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('uploads nothing when the form has not been keyed yet', async () => {
    db.slotFindUnique.mockResolvedValue(slot({ status: 'in_progress' }));
    const res = await upload();
    expect(res.statusCode).toBe(409);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('stores the scan and returns no URL for a keyed slot', async () => {
    db.slotFindUnique.mockResolvedValue(slot({ status: 'done' }, 'keyed'));
    const res = await upload();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ scanned: true });
    expect(mockUpload).toHaveBeenCalledOnce();
  });
});
