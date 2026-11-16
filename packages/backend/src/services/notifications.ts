import admin from 'firebase-admin';
import { config } from '../config.js';
import { prisma } from '../prisma.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushDelivery {
  /** Registered device tokens of the user. */
  devices: number;
  /** Tokens FCM accepted. */
  delivered: number;
  /** False when Firebase is not configured, so nothing was sent. */
  configured: boolean;
}

// ─── Payload constants / factories ───────────────────────────────────────────

export const PAYLOADS = {
  orderWon: (winAmount: string): NotificationPayload => ({
    title: 'כרטיסך ניצח! 🎉',
    body: `זכית ב-₪${winAmount}! הכסף יופקד לארנקך.`,
    data: { type: 'ORDER_WON' },
  }),

  prizeClaim: (winAmount: string): NotificationPayload => ({
    title: 'זכית בפרס גדול! 🎉',
    body: `זכית ב-₪${winAmount}. את הפרס אוספים בהצגת טופס המקור ותעודת זהות.`,
    data: { type: 'PRIZE_CLAIM' },
  }),

  prizeClaimExpiring: (winAmount: string, expiresOn: string): NotificationPayload => ({
    title: 'הפרס שלך עדיין ממתין ⏰',
    body: `הפרס בסך ₪${winAmount} ניתן לאיסוף עד ${expiresOn}. קבעו מועד איסוף באפליקציה.`,
    data: { type: 'PRIZE_CLAIM_EXPIRING' },
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

  /** Fire and forget: never throws (used by the subscription scheduler). */
  async sendToUser(userId: string, payload: NotificationPayload): Promise<void> {
    try {
      await this.deliverToUser(userId, payload);
    } catch (err) {
      console.error('[notifications] sendToUser failed:', err);
    }
  }

  /**
   * Sends to every device of the user and reports what happened, so a caller that logs
   * deliveries can tell sent from not sent. Throws if FCM throws.
   * `configured: false`: Firebase is not set up and nothing went out (dev prints to the console).
   */
  async deliverToUser(userId: string, payload: NotificationPayload): Promise<PushDelivery> {
    const rows = await prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true },
    });
    if (rows.length === 0) return { devices: 0, delivered: 0, configured: this.getAdmin() !== null };
    const tokens = rows.map((r) => r.token);
    let delivered = 0;
    let configured = true;
    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const ok = await this.sendChunk(tokens.slice(i, i + BATCH_SIZE), payload);
      if (ok === null) configured = false;
      else delivered += ok;
    }
    return { devices: tokens.length, delivered, configured };
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

  /** Number of tokens FCM accepted, or null when Firebase is not configured (nothing sent). */
  private async sendChunk(tokens: string[], payload: NotificationPayload): Promise<number | null> {
    const a = this.getAdmin();

    if (!a) {
      console.log(`[DEV] FCM → ${tokens.length} token(s): ${payload.title}`);
      return null;
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
    return result.successCount;
  }
}

export const notificationService = new NotificationService();
