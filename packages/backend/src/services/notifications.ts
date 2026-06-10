import admin from 'firebase-admin';
import { config } from '../config.js';
import { prisma } from '../prisma.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

// ─── Payload constants / factories ───────────────────────────────────────────

export const PAYLOADS = {
  orderWon: (winAmount: string): NotificationPayload => ({
    title: 'כרטיסך ניצח! 🎉',
    body: `זכית ב-₪${winAmount}! הכסף יופקד לארנקך.`,
    data: { type: 'ORDER_WON' },
  }),

  orderLost: (): NotificationPayload => ({
    title: 'תוצאות הגרלה',
    body: 'לא הייתה זכייה הפעם. בהצלחה בפעם הבאה!',
    data: { type: 'ORDER_LOST' },
  }),

  resultsDelayed: (): NotificationPayload => ({
    title: 'תוצאות מתעכבות',
    body: 'בדיקת התוצאות נמשכת, ננסה שוב בקרוב.',
    data: { type: 'RESULTS_DELAYED' },
  }),

  orderKeyed: (): NotificationPayload => ({
    title: 'הטופס הוגש ✅',
    body: 'האופרטור הגיש את הטופס שלך בהצלחה.',
    data: { type: 'ORDER_KEYED' },
  }),

  subscriptionInsufficientFunds: (gameType: string): NotificationPayload => ({
    title: 'מנוי לוטו — יתרה נמוכה',
    body: `לא ניתן להגיש טופס ל-${gameType} עקב יתרה נמוכה בארנק. אנא הפקד כסף ועדכן מנוי.`,
    data: { type: 'SUBSCRIPTION_INSUFFICIENT_FUNDS' },
  }),

  subscriptionCapacityExceeded: (gameType: string): NotificationPayload => ({
    title: 'מנוי לוטו — התור מלא',
    body: `לא ניתן להגיש טופס ל-${gameType} — התור הגיע לתפוסה. נסה שוב מוקדם יותר.`,
    data: { type: 'SUBSCRIPTION_CAPACITY_EXCEEDED' },
  }),
} as const;

// ─── Service ──────────────────────────────────────────────────────────────────

const BATCH_SIZE = 500; // FCM multicast limit
const STALE_CODE = 'messaging/registration-token-not-registered';

class NotificationService {
  private initialized = false;

  private getAdmin(): typeof admin | null {
    if (this.initialized) return admin;
    const json = config.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!json) return null;
    const serviceAccount = JSON.parse(Buffer.from(json, 'base64').toString('utf-8'));
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    this.initialized = true;
    return admin;
  }

  async sendToUser(userId: string, payload: NotificationPayload): Promise<void> {
    try {
      const rows = await prisma.deviceToken.findMany({
        where: { userId },
        select: { token: true },
      });
      if (rows.length === 0) return;
      await this.sendBatch(rows.map((r) => r.token), payload);
    } catch (err) {
      console.error('[notifications] sendToUser failed:', err);
    }
  }

  async sendToMany(userIds: string[], payload: NotificationPayload): Promise<void> {
    if (userIds.length === 0) return;
    try {
      const rows = await prisma.deviceToken.findMany({
        where: { userId: { in: userIds } },
        select: { token: true },
      });
      if (rows.length === 0) return;
      await this.sendBatch(rows.map((r) => r.token), payload);
    } catch (err) {
      console.error('[notifications] sendToMany failed:', err);
    }
  }

  private async sendBatch(tokens: string[], payload: NotificationPayload): Promise<void> {
    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      await this.sendChunk(tokens.slice(i, i + BATCH_SIZE), payload);
    }
  }

  private async sendChunk(tokens: string[], payload: NotificationPayload): Promise<void> {
    const a = this.getAdmin();

    if (!a) {
      tokens.forEach((t) =>
        console.log(`[DEV] FCM → ${t.slice(0, 8)}…: ${payload.title} — ${payload.body}`),
      );
      return;
    }

    const result = await a.messaging().sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      ...(payload.data ? { data: payload.data } : {}),
    });

    const stale = tokens.filter(
      (_, i) => result.responses[i]?.error?.code === STALE_CODE,
    );

    if (stale.length > 0) {
      await prisma.deviceToken
        .deleteMany({ where: { token: { in: stale } } })
        .catch((err: unknown) =>
          console.error('[notifications] Failed to delete stale tokens:', err),
        );
    }
  }
}

export const notificationService = new NotificationService();
