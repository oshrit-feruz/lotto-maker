import { prisma } from '../prisma.js';
import { config } from '../config.js';

export async function ensureDefaultSeedData(): Promise<void> {
  try {
    let locationId: string;

    const existing = await prisma.location.findFirst({ where: { active: true } });
    if (existing) {
      locationId = existing.id;
    } else {
      const location = await prisma.location.create({
        data: {
          name: 'סניף ראשי',
          address: 'ישראל',
          maxConcurrentOperators: 5,
          activeHours: { start: '08:00', end: '20:00' },
          active: true,
        },
      });
      locationId = location.id;
      console.log('[seed] created default location', locationId);
    }

    if (config.DEFAULT_OPERATOR_PHONE) {
      const op = await prisma.operator.findUnique({
        where: { phone: config.DEFAULT_OPERATOR_PHONE },
      });
      if (!op) {
        const created = await prisma.operator.create({
          data: {
            name: 'אופרטור ברירת מחדל',
            phone: config.DEFAULT_OPERATOR_PHONE,
            locationId,
            active: true,
            throughputPerHour: 50,
          },
        });
        console.log('[seed] created default operator', created.id, config.DEFAULT_OPERATOR_PHONE);
      }
    }
    if (config.DEFAULT_ADMIN_PHONE) {
      const adminUser = await prisma.admin.findUnique({ where: { phone: config.DEFAULT_ADMIN_PHONE } });
      if (!adminUser) {
        const created = await prisma.admin.create({
          data: { name: 'מנהל ברירת מחדל', phone: config.DEFAULT_ADMIN_PHONE },
        });
        console.log('[seed] created default admin', created.id);
      }
    }
  } catch (err) {
    console.error('[seed] startup seed error:', err);
  }
}
