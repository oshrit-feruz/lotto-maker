import { prisma } from '../../prisma.js';
import { AppError } from '../../plugins/error-handler.js';

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

// Identity verification goes through the KYC provider: see modules/kyc/kyc.service.ts
export { submitKyc } from '../kyc/kyc.service.js';
