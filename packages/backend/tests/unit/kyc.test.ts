import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.hoisted(() => vi.fn());
const mockFindMany = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockAuditCreate = vi.hoisted(() => vi.fn());

vi.mock('../../src/prisma.js', () => ({
  prisma: {
    user: { findFirst: mockFindFirst, findMany: mockFindMany, update: mockUpdate },
    auditLog: { create: mockAuditCreate },
  },
}));

import { submitKyc } from '../../src/modules/users/users.service.js';
import { backfillIdEncryption } from '../../src/lib/backfill-id-encryption.js';
import { decryptField, hashField } from '../../src/lib/crypto.js';

const VALID = { fullName: 'Dana Levi', idNumber: '123456782', dateOfBirth: '1990-05-15' };

beforeEach(() => {
  vi.clearAllMocks();
  mockFindFirst.mockResolvedValue(null);
  mockUpdate.mockResolvedValue({ verifiedAdult: true });
});

describe('submitKyc', () => {
  it.each(['123456789', '12345', 'abcdefghi', '1234567890', '000000000'])(
    'rejects invalid ID number %s with 400 INVALID_ID_NUMBER',
    async (idNumber) => {
      await expect(submitKyc('u1', { ...VALID, idNumber })).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_ID_NUMBER',
      });
      expect(mockUpdate).not.toHaveBeenCalled();
    },
  );

  it('stores the ID encrypted, with a keyed hash and the last 4 digits, never in plain text', async () => {
    await expect(submitKyc('u1', VALID)).resolves.toEqual({ verifiedAdult: true });

    const { data } = mockUpdate.mock.calls[0]![0];
    expect(decryptField(data.idNumberEnc)).toBe('123456782');
    expect(data.idNumberHash).toBe(hashField('123456782'));
    expect(data.idLast4).toBe('6782');
    expect(data.verifiedAdult).toBe(true);
    expect(data.birthYear).toBe(1990);
    expect(data).not.toHaveProperty('idNumber');
    expect(data).not.toHaveProperty('dateOfBirth');
    expect(JSON.stringify(data)).not.toContain('123456782');
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

  it('rejects minors and impossible dates of birth', async () => {
    const lastYear = `${new Date().getFullYear() - 1}-01-01`;
    await expect(submitKyc('u1', { ...VALID, dateOfBirth: lastYear })).rejects.toMatchObject({
      statusCode: 403,
      code: 'AGE_VERIFICATION_FAILED',
    });
    for (const dateOfBirth of ['1990-13-45', '2999-01-01']) {
      await expect(submitKyc('u1', { ...VALID, dateOfBirth })).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_DATE_OF_BIRTH',
      });
    }
    expect(mockUpdate).not.toHaveBeenCalled();
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
