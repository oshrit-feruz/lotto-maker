import { differenceInYears, parseISO } from 'date-fns';
import { prisma } from '../../prisma.js';
import { AppError } from '../../plugins/error-handler.js';
import { writeAuditLog } from '../../lib/audit-log.js';

export async function getMe(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return user;
}

export async function updateMe(userId: string, data: { fullName?: string; fcmToken?: string }) {
  return prisma.user.update({ where: { id: userId }, data });
}

export async function submitKyc(
  userId: string,
  params: { fullName: string; idNumber: string; dateOfBirth: string },
) {
  const dob = parseISO(params.dateOfBirth);
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

  const existing = await prisma.user.findFirst({
    where: { idNumber: params.idNumber, NOT: { id: userId } },
  });
  if (existing) {
    throw new AppError(409, 'ID_NUMBER_ALREADY_USED');
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      fullName: params.fullName,
      idNumber: params.idNumber,
      dateOfBirth: dob,
      verifiedAdult: true,
    },
  });

  await writeAuditLog({
    entityType: 'user',
    entityId: userId,
    action: 'kyc_approved',
    actorId: userId,
    actorType: 'user',
  });

  return { verifiedAdult: user.verifiedAdult };
}
