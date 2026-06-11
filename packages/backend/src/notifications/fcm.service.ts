import { config } from '../config.js';

interface FcmPayload {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

class FcmService {
  private initialized = false;

  private ensureInit() {
    if (this.initialized) return;
    if (!config.FIREBASE_PROJECT_ID || !config.FIREBASE_CLIENT_EMAIL || !config.FIREBASE_PRIVATE_KEY) {
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const admin = require('firebase-admin') as typeof import('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: config.FIREBASE_PROJECT_ID,
          clientEmail: config.FIREBASE_CLIENT_EMAIL,
          privateKey: config.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    }
    this.initialized = true;
  }

  async send(payload: FcmPayload): Promise<void> {
    this.ensureInit();

    if (!this.initialized) {
      console.log(`[DEV] FCM → ${payload.token}: ${payload.title} — ${payload.body}`);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const admin = require('firebase-admin') as typeof import('firebase-admin');
    const message: import('firebase-admin/messaging').Message = {
      token: payload.token,
      notification: { title: payload.title, body: payload.body },
      ...(payload.data ? { data: payload.data } : {}),
    };
    await admin.messaging().send(message);
  }
}

export const fcmService = new FcmService();

export async function notifyUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  const { prisma } = await import('../prisma.js');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { fcmToken: true } });
  if (!user?.fcmToken) return;
  await fcmService.send({ token: user.fcmToken, title, body, ...(data ? { data } : {}) });
}
