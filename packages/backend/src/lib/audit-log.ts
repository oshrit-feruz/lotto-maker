import { prisma } from '../prisma.js';
import type { PrismaClient } from '@prisma/client';

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

interface AuditEntry {
  entityType: string;
  entityId: string;
  action: string;
  actorId?: string;
  actorType?: 'user' | 'operator' | 'system';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
}

function buildAuditData(entry: AuditEntry) {
  return {
    entityType: entry.entityType,
    entityId: entry.entityId,
    orderId: entry.entityType === 'order' ? entry.entityId : null,
    action: entry.action,
    actorId: entry.actorId,
    actorType: entry.actorType,
    metadata: entry.metadata,
  };
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({ data: buildAuditData(entry) });
}

export async function writeAuditLogTx(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({ data: buildAuditData(entry) });
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

export function orderStatusChangeTx(
  tx: Tx,
  orderId: string,
  from: string,
  to: string,
  actorId: string,
  actorType: 'user' | 'operator' | 'system',
) {
  return writeAuditLogTx(tx, {
    entityType: 'order',
    entityId: orderId,
    action: `status_change:${from}->${to}`,
    actorId,
    actorType,
  });
}
