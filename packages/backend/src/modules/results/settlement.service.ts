import { prisma } from '../../prisma.js';
import { orderStatusChange } from '../../lib/audit-log.js';
import { notificationService, PAYLOADS } from '../../services/notifications.js';

/** Results never arrived for this draw: scanned orders wait in `results_delayed`. */
export async function markDrawResultsDelayed(drawId: string): Promise<void> {
  const orders = await prisma.order.findMany({
    where: { drawId, status: 'scanned' },
    select: { id: true, userId: true },
  });
  for (const order of orders) {
    const { count } = await prisma.order.updateMany({
      where: { id: order.id, status: 'scanned' },
      data: { status: 'results_delayed' },
    });
    if (count === 0) continue;
    await orderStatusChange(order.id, 'scanned', 'results_delayed', 'system', 'system');
    notificationService.sendToUser(order.userId, PAYLOADS.resultsDelayed()).catch(console.error);
  }
}
