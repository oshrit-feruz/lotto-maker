import { prisma } from '../prisma.js';

interface AuditEntry {
  entityType: string;
  entityId: string;
  action: string;
  actorId?: string;
  actorType?: 'user' | 'operator' | 'system';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      actorId: entry.actorId,
      actorType: entry.actorType,
      metadata: entry.metadata,
    },
  });
}

export function orderStatusChange(
  orderId: string,
  from: string,
  to: string,
  actorId: string,
  actorType: 'user' | 'operator' | 'system',
) {
  return writeAuditLog({
    entityType: 'order',
    entityId: orderId,
    action: `status_change:${from}->${to}`,
    actorId,
    actorType,
  });
}
