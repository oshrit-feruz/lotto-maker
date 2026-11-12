import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.hoisted(() => vi.fn()); // prisma.user.findFirst (duplicate ID)
const mockFindMany = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn()); // prisma.user.update
const mockAuditCreate = vi.hoisted(() => vi.fn());
const mockCheckCreate = vi.hoisted(() => vi.fn());
const mockCheckFindFirst = vi.hoisted(() => vi.fn());
const mockCheckFindUnique = vi.hoisted(() => vi.fn());
const mockCheckFindMany = vi.hoisted(() => vi.fn());
const mockCheckUpdateMany = vi.hoisted(() => vi.fn());

vi.mock('../../src/prisma.js', () => {
  const client: Record<string, unknown> = {
    user: { findFirst: mockFindFirst, findMany: mockFindMany, update: mockUpdate },
    auditLog: { create: mockAuditCreate },
    kycCheck: {
      create: mockCheckCreate,
      findFirst: mockCheckFindFirst,
      findUnique: mockCheckFindUnique,
      findMany: mockCheckFindMany,
      updateMany: mockCheckUpdateMany,
    },
  };
  client.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(client);
  return { prisma: client };
});

import { submitKyc } from '../../src/modules/users/users.service.js';
import {
  approveKyc,
  rejectKyc,
  listKycChecks,
  setKycProviderForTests,
} from '../../src/modules/kyc/kyc.service.js';
import { MockKycProvider } from '../../src/modules/kyc/mock-kyc-provider.js';
import { backfillIdEncryption } from '../../src/lib/backfill-id-encryption.js';
import { decryptField, hashField } from '../../src/lib/crypto.js';

const VALID = { fullName: 'Dana Levi', idNumber: '123456782', dateOfBirth: '1990-05-15' };

beforeEach(() => {
  vi.clearAllMocks();
  setKycProviderForTests(new MockKycProvider());
  mockFindFirst.mockResolvedValue(null);
  mockCheckFindFirst.mockResolvedValue(null);
  mockUpdate.mockResolvedValue({ verifiedAdult: true });
  mockCheckCreate.mockResolvedValue({});
  mockCheckUpdateMany.mockResolvedValue({ count: 1 });
});

describe('submitKyc: verified', () => {
  it.each(['123456789', '12345', 'abcdefghi', '1234567890', '000000000'])(
    'rejects malformed ID number %s with 400 INVALID_ID_NUMBER before calling the provider',
    async (idNumber) => {
      await expect(submitKyc('u1', { ...VALID, idNumber })).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_ID_NUMBER',
      });
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockCheckCreate).not.toHaveBeenCalled();
    },
  );

  it('verifies, sets verifiedAdult and stores the ID encrypted, never in plain text', async () => {
    await expect(submitKyc('u1', VALID)).resolves.toEqual({ verifiedAdult: true, status: 'verified' });

    const { data } = mockUpdate.mock.calls[0]![0];
    expect(decryptField(data.idNumberEnc)).toBe('123456782');
    expect(data.idNumberHash).toBe(hashField('123456782'));
    expect(data.idLast4).toBe('6782');
    expect(data.verifiedAdult).toBe(true);
    expect(data.birthYear).toBe(1990);
    expect(JSON.stringify(data)).not.toContain('123456782');

    const check = mockCheckCreate.mock.calls[0]![0].data;
    expect(check).toMatchObject({ userId: 'u1', status: 'verified', provider: 'mock', idLast4: '6782' });
    expect(check.reference).toMatch(/^mock_kyc_/);
    expect(decryptField(check.idNumberEnc)).toBe('123456782');
    expect(JSON.stringify(check)).not.toContain('123456782');
    // Nothing identifying goes into the audit log either
    expect(JSON.stringify(mockAuditCreate.mock.calls)).not.toContain('6782');
  });

  it('pads a short ID so the same person cannot register twice', async () => {
    await submitKyc('u1', { ...VALID, idNumber: '39337423' });
    const { data } = mockUpdate.mock.calls[0]![0];
    expect(decryptField(data.idNumberEnc)).toBe('039337423');
    expect(data.idNumberHash).toBe(hashField('039337423'));
    expect(mockFindFirst.mock.calls[0]![0].where.idNumberHash).toBe(hashField('039337423'));
  });

  it('rejects an ID already used by another account', async () => {
    mockFindFirst.mockResolvedValue({ id: 'someone-else' });
    await expect(submitKyc('u1', VALID)).rejects.toMatchObject({ statusCode: 409, code: 'ID_NUMBER_ALREADY_USED' });
    expect(mockUpdate).not.toHaveBeenCalled();

    // …also when the unique index catches a concurrent submission
    mockFindFirst.mockResolvedValue(null);
    mockUpdate.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expect(submitKyc('u1', VALID)).rejects.toMatchObject({ statusCode: 409, code: 'ID_NUMBER_ALREADY_USED' });
  });

  it('rejects impossible dates of birth with 400', async () => {
    for (const dateOfBirth of ['1990-13-45', '2999-01-01']) {
      await expect(submitKyc('u1', { ...VALID, dateOfBirth })).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_DATE_OF_BIRTH',
      });
    }
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('refuses a second submission while one waits for review', async () => {
    mockCheckFindFirst.mockResolvedValue({ id: 'chk1' });
    await expect(submitKyc('u1', VALID)).rejects.toMatchObject({ statusCode: 409, code: 'KYC_PENDING' });
  });
});

describe('submitKyc: rejected', () => {
  it('returns 422 KYC_REJECTED for a minor, stores the reason and does not verify', async () => {
    const lastYear = `${new Date().getFullYear() - 1}-01-01`;
    await expect(submitKyc('u1', { ...VALID, dateOfBirth: lastYear })).rejects.toMatchObject({
      statusCode: 422,
      code: 'KYC_REJECTED',
      details: { reason: 'UNDERAGE' },
    });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCheckCreate.mock.calls[0]![0].data).toMatchObject({ status: 'rejected', reason: 'UNDERAGE' });
  });

  it('returns 422 when the provider rejects', async () => {
    setKycProviderForTests({
      name: 'test',
      verify: async () => ({ status: 'rejected', reference: 'r1', reason: 'NAME_MISMATCH' }),
    });
    await expect(submitKyc('u1', VALID)).rejects.toMatchObject({ statusCode: 422, code: 'KYC_REJECTED' });
    expect(mockCheckCreate.mock.calls[0]![0].data).toMatchObject({
      status: 'rejected',
      reason: 'NAME_MISMATCH',
      reference: 'r1',
      provider: 'test',
    });
  });
});

describe('submitKyc: manual review', () => {
  beforeEach(() => setKycProviderForTests(new MockKycProvider({ forceManualReview: true })));

  it('queues the check for an admin and leaves the user unverified', async () => {
    await expect(submitKyc('u1', VALID)).resolves.toEqual({ verifiedAdult: false, status: 'manual_review' });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCheckCreate.mock.calls[0]![0].data).toMatchObject({ userId: 'u1', status: 'manual_review' });
  });

  it('admin approval copies the stored identity onto the user, audited', async () => {
    await submitKyc('u1', VALID);
    const stored = { id: 'chk1', ...mockCheckCreate.mock.calls[0]![0].data };
    mockCheckFindUnique.mockResolvedValue(stored);

    await expect(approveKyc('chk1', 'admin1')).resolves.toEqual({ id: 'chk1', status: 'verified' });
    const { data, where } = mockUpdate.mock.calls[0]![0];
    expect(where).toEqual({ id: 'u1' });
    expect(data.verifiedAdult).toBe(true);
    expect(decryptField(data.idNumberEnc)).toBe('123456782');
    expect(mockAuditCreate.mock.calls.at(-1)![0].data).toMatchObject({
      action: 'kyc:manual_review->verified',
      actorId: 'admin1',
      actorType: 'admin',
    });
  });

  it('admin rejection stores the reason and does not verify, audited', async () => {
    mockCheckFindUnique.mockResolvedValue({ id: 'chk1', userId: 'u1', status: 'manual_review' });
    await expect(rejectKyc('chk1', 'admin1', 'blurry document')).resolves.toEqual({ id: 'chk1', status: 'rejected' });
    expect(mockCheckUpdateMany.mock.calls[0]![0].data).toMatchObject({ status: 'rejected', reason: 'blurry document' });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockAuditCreate.mock.calls.at(-1)![0].data.action).toBe('kyc:manual_review->rejected');
  });

  it('cannot decide a check twice', async () => {
    mockCheckFindUnique.mockResolvedValue({ id: 'chk1', userId: 'u1', status: 'verified' });
    await expect(approveKyc('chk1', 'admin1')).rejects.toMatchObject({ statusCode: 409, code: 'KYC_NOT_PENDING' });
    mockCheckFindUnique.mockResolvedValue({ id: 'chk1', userId: 'u1', status: 'manual_review' });
    mockCheckUpdateMany.mockResolvedValue({ count: 0 });
    await expect(rejectKyc('chk1', 'admin1', 'late')).rejects.toMatchObject({ code: 'KYC_NOT_PENDING' });
  });

  it('listing the queue is audited', async () => {
    mockCheckFindMany.mockResolvedValue([]);
    await listKycChecks('admin1', 'manual_review');
    expect(mockCheckFindMany.mock.calls[0]![0].where).toEqual({ status: 'manual_review' });
    expect(mockAuditCreate.mock.calls[0]![0].data.action).toBe('kyc:list');
  });
});

describe('MockKycProvider', () => {
  it('verifies a valid ID of an adult and rejects the rest', async () => {
    const p = new MockKycProvider();
    const base = { idNumber: '123456782', fullName: 'x', birthDate: '1990-05-15' };
    expect((await p.verify(base)).status).toBe('verified');
    expect(await p.verify({ ...base, idNumber: '123456789' })).toMatchObject({ status: 'rejected', reason: 'INVALID_ID_CHECK_DIGIT' });
    expect(await p.verify({ ...base, birthDate: `${new Date().getFullYear() - 5}-01-01` })).toMatchObject({
      status: 'rejected',
      reason: 'UNDERAGE',
    });
  });
});

describe('backfillIdEncryption', () => {
  it('encrypts legacy plaintext IDs and empties the legacy column', async () => {
    mockFindMany.mockResolvedValue([{ id: 'u1', idNumberLegacy: '39337423' }]);
    await expect(backfillIdEncryption()).resolves.toBe(1);

    const { where, data } = mockUpdate.mock.calls[0]![0];
    expect(where).toEqual({ id: 'u1' });
    expect(data.idNumberLegacy).toBeNull();
    expect(decryptField(data.idNumberEnc)).toBe('039337423');
    expect(data.idNumberHash).toBe(hashField('039337423'));
    expect(data.idLast4).toBe('7423');
  });

  it('does nothing when there is no legacy data', async () => {
    mockFindMany.mockResolvedValue([]);
    await expect(backfillIdEncryption()).resolves.toBe(0);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
