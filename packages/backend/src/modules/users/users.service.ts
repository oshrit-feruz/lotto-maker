import { differenceInYears, isValid, parseISO } from 'date-fns';
import { prisma } from '../../prisma.js';
import { AppError } from '../../plugins/error-handler.js';
import { writeAuditLog } from '../../lib/audit-log.js';
import { encryptField, hashField, isValidIsraeliId, normalizeIsraeliId } from '../../lib/crypto.js';

// What a user may see about themselves. The encrypted ID, its hash and
// push tokens never leave the server.
const publicUserSelect = {
  id: true,
  phone: true,
  fullName: true,
  verifiedAdult: true,
  walletBalance: true,
  status: true,
  idLast4: true,
  createdAt: true,
} as const;

export async function getMe(userId: string) {
  return prisma.user.findUniqueOrThrow({ where: { id: userId }, select: publicUserSelect });
}

export async function updateMe(userId: string, data: { fullName?: string; fcmToken?: string }) {
  // After KYC the name is the one on the ID. Bank withdrawals are matched against it, so it
  // must not be editable here.
  if (data.fullName !== undefined) {
    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { verifiedAdult: true, fullName: true },
    });
    if (current?.verifiedAdult && current.fullName !== data.fullName) {
      throw new AppError(403, 'NAME_LOCKED', 'The name cannot be changed after identity verification');
    }
  }
  return prisma.user.update({ where: { id: userId }, data, select: publicUserSelect });
}

export async function submitKyc(
  userId: string,
  params: { fullName: string; idNumber: string; dateOfBirth: string },
) {
  const idNumber = normalizeIsraeliId(params.idNumber);
  if (!idNumber || !isValidIsraeliId(idNumber)) {
    throw new AppError(400, 'INVALID_ID_NUMBER', 'ID number is not valid');
  }

  const dob = parseISO(params.dateOfBirth);
  if (!isValid(dob) || dob > new Date()) {
    throw new AppError(400, 'INVALID_DATE_OF_BIRTH', 'Date of birth is not valid');
  }
  const age = differenceInYears(new Date(), dob);

  if (age < 18) {
    await writeAuditLog({
      entityType: 'user',
      entityId: userId,
      action: 'kyc_rejected:underage',
      actorId: userId,
      actorType: 'user',
      metadata: { age },
    });
    throw new AppError(403, 'AGE_VERIFICATION_FAILED', 'Must be 18 or older to use this service');
  }

  // The ciphertext is different on every encryption, so duplicates are found
  // through the keyed hash instead.
  const idNumberHash = hashField(idNumber);
  const existing = await prisma.user.findFirst({
    where: { idNumberHash, NOT: { id: userId } },
    select: { id: true },
  });
  if (existing) {
    throw new AppError(409, 'ID_NUMBER_ALREADY_USED');
  }

  let user;
  try {
    user = await prisma.user.update({
      where: { id: userId },
      data: {
        fullName: params.fullName,
        idNumberEnc: encryptField(idNumber),
        idNumberHash,
        idLast4: idNumber.slice(-4),
        idNumberLegacy: null,
        // The full date of birth is used for the age check above and not stored.
        birthYear: dob.getFullYear(),
        verifiedAdult: true,
      },
      select: { verifiedAdult: true },
    });
  } catch (err) {
    // Lost a race against another account submitting the same ID (unique index)
    if ((err as { code?: string }).code === 'P2002') throw new AppError(409, 'ID_NUMBER_ALREADY_USED');
    throw err;
  }

  await writeAuditLog({
    entityType: 'user',
    entityId: userId,
    action: 'kyc_approved',
    actorId: userId,
    actorType: 'user',
  });

  return { verifiedAdult: user.verifiedAdult };
}
