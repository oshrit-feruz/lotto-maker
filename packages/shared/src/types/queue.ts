export type QueueSlotStatus = 'waiting' | 'in_progress' | 'done' | 'failed';

export interface QueueSlot {
  id: string;
  orderId: string;
  operatorId: string | null;
  locationId: string;
  priority: number;
  deadline: string;
  status: QueueSlotStatus;
  retryCount: number;
  assignedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}
