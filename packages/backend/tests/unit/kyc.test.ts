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
const mockCheckCount = vi.hoisted(() => vi.fn());
/** Which writes ran inside a transaction (and which one: they share an id when committed together). */
const txLog = vi.hoisted(() => ({ current: 0, next: 0, writes: [] as Array<{ what: string; tx: number }> }));

vi.mock('../../src/prisma.js', () => {
  const inTx = (what: string, fn: (...a: any[]) => any) => (...args: any[]) => {
    txLog.writes.push({ what, tx: txLog.current });
    return fn(...args);
  };
  const client: Record<string, unknown> = {
    user: { findFirst: mockFindFirst, findMany: mockFindMany, update: mockUpdate },
    auditLog: { create: inTx('audit', (...a) => mockAuditCreate(...a)) },
    kycCheck: {
      create: inTx('check', (...a) => mockCheckCreate(...a)),
      findFirst: mockCheckFindFirst,
      findUnique: mockCheckFindUnique,
      findMany: mockCheckFindMany,
      count: mockCheckCount,
      updateMany: inTx('check_update', (...a) => mockCheckUpdateMany(...a)),
    },
  };
  client.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => {
    const outer = txLog.current;
    txLog.current = ++txLog.next;
    try {
      return await fn(client);
    } finally {
      txLog.current = outer;
    }
  };
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
  txLog.writes = [];
});

/** True when the check write and the audit entry ran in the same (non-zero) transaction. */
function committedTogether(checkWhat = 'check') {
  const check = txLog.writes.find((w) => w.what === checkWhat);
  const audit = txLog.writes.filter((w) => w.what === 'audit').at(-1);
  return !!check && !!audit && check.tx !== 0 && check.tx === audit.tx;
}

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

describe('submitKyc: under 18', () => {
  const verify = vi.fn(async () => ({ status: 'verified' as const, reference: 'r-minor' }));

  it.each([
    ['verified', { status: 'verified' as const, reference: 'r1' }],
    ['manual_review', { status: 'manual_review' as const, reference: 'r2' }],
  ])('refuses a minor with 403 AGE_VERIFICATION_FAILED before the provider, even one that would say %s', async (_v, verdict) => {
    verify.mockResolvedValue(verdict as never);
    setKycProviderForTests({ name: 'lenient', verify });
    const seventeen = new Date();
    seventeen.setFullYear(seventeen.getFullYear() - 17);
    await expect(
      submitKyc('u1', { ...VALID, dateOfBirth: seventeen.toISOString().slice(0, 10) }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'AGE_VERIFICATION_FAILED' });
    expect(verify).not.toHaveBeenCalled();
    expect(mockCheckCreate).not.toHaveBeenCalled(); // no check an admin could approve
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockAuditCreate.mock.calls[0]![0].data).toMatchObject({ action: 'kyc_rejected:underage', metadata: { age: 17 } });
  });

  it('lets an 18-year-old through to the provider', async () => {
    const eighteen = new Date();
    eighteen.setFullYear(eighteen.getFullYear() - 18);
    eighteen.setDate(eighteen.getDate() - 1);
    await expect(submitKyc('u1', { ...VALID, dateOfBirth: eighteen.toISOString().slice(0, 10) })).resolves.toMatchObject({
      status: 'verified',
    });
  });
});

describe('submitKyc: rejected', () => {
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
    expect(committedTogether()).toBe(true);
  });
});

describe('submitKyc: manual review', () => {
  beforeEach(() => setKycProviderForTests(new MockKycProvider({ forceManualReview: true })));

  it('queues the check for an admin and leaves the user unverified', async () => {
    await expect(submitKyc('u1', VALID)).resolves.toEqual({ verifiedAdult: false, status: 'manual_review' });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCheckCreate.mock.calls[0]![0].data).toMatchObject({ userId: 'u1', status: 'manual_review' });
    // The check and its audit entry are one transaction
    expect(committedTogether()).toBe(true);
  });

  it('a concurrent second submission hits the one-pending-check index and gets 409 KYC_PENDING', async () => {
    // Both passed the findFirst guard; the database refuses the second insert
    mockCheckCreate.mockRejectedValueOnce(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));
    await expect(submitKyc('u1', VALID)).rejects.toMatchObject({ statusCode: 409, code: 'KYC_PENDING' });
  });

  it('other errors while queueing the check are not turned into KYC_PENDING', async () => {
    mockCheckCreate.mockRejectedValueOnce(new Error('db down'));
    await expect(submitKyc('u1', VALID)).rejects.toThrow('db down');
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
    expect(committedTogether('check_update')).toBe(true);
  });

  it('approval and its audit entry are one transaction', async () => {
    mockCheckFindUnique.mockResolvedValue({ id: 'chk1', userId: 'u1', status: 'manual_review', reference: 'r' });
    await approveKyc('chk1', 'admin1');
    expect(committedTogether('check_update')).toBe(true);
  });

  it('a blank or whitespace-only rejection reason is refused, and the trimmed reason is stored', async () => {
    mockCheckFindUnique.mockResolvedValue({ id: 'chk1', userId: 'u1', status: 'manual_review' });
    for (const reason of ['', '  ', '\n\t ', ' a ']) {
      await expect(rejectKyc('chk1', 'admin1', reason)).rejects.toMatchObject({ statusCode: 400, code: 'REASON_REQUIRED' });
    }
    expect(mockCheckUpdateMany).not.toHaveBeenCalled();
    await rejectKyc('chk1', 'admin1', '  blurry document  ');
    expect(mockCheckUpdateMany.mock.calls[0]![0].data.reason).toBe('blurry document');
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
    mockCheckCount.mockResolvedValue(0);
    await listKycChecks('admin1', { status: 'manual_review' });
    expect(mockCheckFindMany.mock.calls[0]![0].where).toEqual({ status: 'manual_review' });
    expect(mockAuditCreate.mock.calls[0]![0].data.action).toBe('kyc:list');
  });

  it('the queue is paged: 50 by default, at most 200, with the total', async () => {
    mockCheckFindMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    mockCheckCount.mockResolvedValue(312);

    await expect(listKycChecks('admin1')).resolves.toEqual({
      items: [{ id: 'a' }, { id: 'b' }],
      total: 312,
      page: 1,
      pageSize: 50,
    });
    expect(mockCheckFindMany.mock.calls[0]![0]).toMatchObject({ skip: 0, take: 50 });

    await expect(listKycChecks('admin1', { page: 3, pageSize: 20 })).resolves.toMatchObject({ page: 3, pageSize: 20 });
    expect(mockCheckFindMany.mock.calls[1]![0]).toMatchObject({ skip: 40, take: 20 });

    await expect(listKycChecks('admin1', { pageSize: 5000 })).resolves.toMatchObject({ pageSize: 200 });
    expect(mockCheckFindMany.mock.calls[2]![0]).toMatchObject({ take: 200 });
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
