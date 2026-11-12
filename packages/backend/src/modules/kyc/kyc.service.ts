import { isValid, parseISO } from 'date-fns';
import { prisma } from '../../prisma.js';
import { config } from '../../config.js';
import { AppError } from '../../plugins/error-handler.js';
import { writeAuditLog, writeAuditLogTx } from '../../lib/audit-log.js';
import { encryptField, hashField, isValidIsraeliId, normalizeIsraeliId } from '../../lib/crypto.js';
import type { KycProvider } from './kyc-provider.js';
import { MockKycProvider } from './mock-kyc-provider.js';

let provider: KycProvider | null = null;

export function getKycProvider(): KycProvider {
  if (provider) return provider;
  // The mock provider verifies anyone with a well-formed ID, so it must never run in production.
  if (config.NODE_ENV === 'production') {
    throw new AppError(503, 'KYC_PROVIDER_NOT_CONFIGURED', 'Identity verification is not available yet');
  }
  provider = new MockKycProvider({ forceManualReview: config.KYC_MOCK_FORCE_MANUAL_REVIEW });
  return provider;
}

/** Tests only: swap the provider (pass null to reset to the configured one). */
export function setKycProviderForTests(p: KycProvider | null): void {
  provider = p;
}

export type SubmitKycResult = { verifiedAdult: boolean; status: 'verified' | 'manual_review' };

interface Identity {
  fullName: string;
  idNumberEnc: string;
  idNumberHash: string;
  idLast4: string;
  birthYear: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = any;

/** Copies a verified identity onto the user. A concurrent claim of the same ID hits the unique index. */
async function applyIdentityTx(tx: AnyTx, userId: string, identity: Identity): Promise<void> {
  await tx.user.update({
    where: { id: userId },
    data: {
      fullName: identity.fullName,
      idNumberEnc: identity.idNumberEnc,
      idNumberHash: identity.idNumberHash,
      idLast4: identity.idLast4,
      idNumberLegacy: null,
      // The full date of birth is used for the check and not stored.
      birthYear: identity.birthYear,
      verifiedAdult: true,
    },
    select: { verifiedAdult: true },
  });
}

function mapUniqueViolation(err: unknown): never {
  if ((err as { code?: string }).code === 'P2002') throw new AppError(409, 'ID_NUMBER_ALREADY_USED');
  throw err;
}

export async function submitKyc(
  userId: string,
  params: { fullName: string; idNumber: string; dateOfBirth: string },
): Promise<SubmitKycResult> {
  const idNumber = normalizeIsraeliId(params.idNumber);
  if (!idNumber || !isValidIsraeliId(idNumber)) {
    throw new AppError(400, 'INVALID_ID_NUMBER', 'ID number is not valid');
  }
  const dob = parseISO(params.dateOfBirth);
  if (!isValid(dob) || dob > new Date()) {
    throw new AppError(400, 'INVALID_DATE_OF_BIRTH', 'Date of birth is not valid');
  }

  const pending = await prisma.kycCheck.findFirst({
    where: { userId, status: 'manual_review' },
    select: { id: true },
  });
  if (pending) throw new AppError(409, 'KYC_PENDING', 'Your identity check is waiting for review');

  // The ciphertext is different on every encryption, so duplicates are found through the keyed hash.
  const idNumberHash = hashField(idNumber);
  const existing = await prisma.user.findFirst({
    where: { idNumberHash, NOT: { id: userId } },
    select: { id: true },
  });
  if (existing) throw new AppError(409, 'ID_NUMBER_ALREADY_USED');

  const kycProvider = getKycProvider();
  const result = await kycProvider.verify({
    idNumber,
    fullName: params.fullName,
    birthDate: params.dateOfBirth,
  });

  const identity: Identity = {
    fullName: params.fullName,
    idNumberEnc: encryptField(idNumber),
    idNumberHash,
    idLast4: idNumber.slice(-4),
    birthYear: dob.getFullYear(),
  };
  const checkData = {
    userId,
    provider: kycProvider.name,
    reference: result.reference,
    status: result.status,
    reason: result.reason ?? null,
    ...identity,
  };

  if (result.status === 'verified') {
    try {
      await prisma.$transaction(async (tx: AnyTx) => {
        await tx.kycCheck.create({ data: checkData });
        await applyIdentityTx(tx, userId, identity);
        await writeAuditLogTx(tx, {
          entityType: 'user',
          entityId: userId,
          action: 'kyc_approved',
          actorId: userId,
          actorType: 'user',
          metadata: { reference: result.reference, provider: kycProvider.name },
        });
      });
    } catch (err) {
      mapUniqueViolation(err);
    }
    return { verifiedAdult: true, status: 'verified' };
  }

  await prisma.kycCheck.create({ data: checkData });
  // Nothing identifying goes into the audit log: no ID number, not even the last 4.
  await writeAuditLog({
    entityType: 'user',
    entityId: userId,
    action: `kyc_${result.status}`,
    actorId: userId,
    actorType: 'user',
    metadata: { reference: result.reference, provider: kycProvider.name, reason: result.reason },
  });

  if (result.status === 'rejected') {
    throw new AppError(422, 'KYC_REJECTED', 'Identity verification was rejected', { reason: result.reason });
  }
  return { verifiedAdult: false, status: 'manual_review' };
}

// ─── Admin queue ─────────────────────────────────────────────────────────────

const adminSelect = {
  id: true,
  userId: true,
  provider: true,
  reference: true,
  status: true,
  reason: true,
  fullName: true,
  idLast4: true,
  birthYear: true,
  reviewedById: true,
  reviewedAt: true,
  createdAt: true,
} as const;

export async function listKycChecks(adminId: string, status?: 'verified' | 'rejected' | 'manual_review') {
  const rows = await prisma.kycCheck.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: 'asc' },
    select: adminSelect,
  });
  await writeAuditLog({
    entityType: 'kyc',
    entityId: 'list',
    action: 'kyc:list',
    actorId: adminId,
    actorType: 'admin',
    metadata: { status: status ?? 'all', count: rows.length },
  });
  return rows;
}

async function loadPending(id: string) {
  const check = await prisma.kycCheck.findUnique({ where: { id } });
  if (!check) throw new AppError(404, 'KYC_CHECK_NOT_FOUND');
  if (check.status !== 'manual_review') throw new AppError(409, 'KYC_NOT_PENDING');
  return check;
}

export async function approveKyc(id: string, adminId: string) {
  const check = await loadPending(id);
  try {
    await prisma.$transaction(async (tx: AnyTx) => {
      // Only one reviewer can move the check out of manual_review
      const { count } = await tx.kycCheck.updateMany({
        where: { id, status: 'manual_review' },
        data: { status: 'verified', reviewedById: adminId, reviewedAt: new Date() },
      });
      if (count === 0) throw new AppError(409, 'KYC_NOT_PENDING');
      await applyIdentityTx(tx, check.userId, check);
      await writeAuditLogTx(tx, {
        entityType: 'kyc',
        entityId: id,
        action: 'kyc:manual_review->verified',
        actorId: adminId,
        actorType: 'admin',
        metadata: { userId: check.userId, reference: check.reference },
      });
    });
  } catch (err) {
    mapUniqueViolation(err);
  }
  return { id, status: 'verified' as const };
}

export async function rejectKyc(id: string, adminId: string, reason: string) {
  const check = await loadPending(id);
  await prisma.$transaction(async (tx: AnyTx) => {
    const { count } = await tx.kycCheck.updateMany({
      where: { id, status: 'manual_review' },
      data: { status: 'rejected', reason, reviewedById: adminId, reviewedAt: new Date() },
    });
    if (count === 0) throw new AppError(409, 'KYC_NOT_PENDING');
    await writeAuditLogTx(tx, {
      entityType: 'kyc',
      entityId: id,
      action: 'kyc:manual_review->rejected',
      actorId: adminId,
      actorType: 'admin',
      metadata: { userId: check.userId, reason },
    });
  });
  return { id, status: 'rejected' as const };
}
