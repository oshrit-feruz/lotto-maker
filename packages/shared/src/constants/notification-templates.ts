/** Channels a notification can go out on. */
export const NOTIFICATION_CHANNELS = ['sms', 'email', 'push'] as const;
export type NotificationChannelName = (typeof NOTIFICATION_CHANNELS)[number];

/** Values each template needs (all strings, already formatted: amounts as "123.45", dates as dd.mm.yyyy). */
export interface NotificationTemplateParams {
  otp: { code: string };
  order_scanned: { drawNumber?: string };
  /** A small prize, credited to the wallet. */
  order_won: { amount: string };
  /** A prize above the wallet limit: collected with the original ticket and ID. */
  big_prize_claim_created: { amount: string };
  claim_reminder: { amount: string; expiresOn: string };
  withdrawal_paid: { amount: string };
  withdrawal_rejected: { amount: string; reason?: string };
  card_credit_paid: { amount: string };
  deposit_receipt: { amount: string };
  order_lost: Record<string, never>;
  results_delayed: Record<string, never>;
}

export type NotificationTemplateName = keyof NotificationTemplateParams;

interface TemplateDef<T extends NotificationTemplateName> {
  /** OTP and legal notices ignore the user's opt-out. */
  mandatory: boolean;
  /** Channels used when the caller does not choose. */
  defaultChannels: readonly NotificationChannelName[];
  title: (p: NotificationTemplateParams[T]) => string;
  body: (p: NotificationTemplateParams[T]) => string;
}

type Templates = { [K in NotificationTemplateName]: TemplateDef<K> };

/** Hebrew texts. Edit wording here only; the backend never builds notification text itself. */
export const NOTIFICATION_TEMPLATES: Templates = {
  otp: {
    mandatory: true,
    defaultChannels: ['sms'],
    title: () => 'קוד אימות',
    body: (p) => `קוד האימות שלך: ${p.code}`,
  },
  order_scanned: {
    mandatory: false,
    defaultChannels: ['push'],
    title: () => 'הטופס הוגש ✅',
    body: (p) =>
      p.drawNumber
        ? `הטופס שלך להגרלה ${p.drawNumber} הוגש וסרוק. התוצאות יתעדכנו לאחר ההגרלה.`
        : 'הטופס שלך הוגש וסרוק. התוצאות יתעדכנו לאחר ההגרלה.',
  },
  order_won: {
    mandatory: false,
    defaultChannels: ['push'],
    title: () => 'כרטיסך ניצח! 🎉',
    body: (p) => `זכית ב-₪${p.amount}! הכסף הופקד בארנק שלך.`,
  },
  big_prize_claim_created: {
    // The claim has a deadline, so this counts as a legal notice
    mandatory: true,
    defaultChannels: ['push', 'sms'],
    title: () => 'זכית בפרס גדול! 🎉',
    body: (p) => `זכית ב-₪${p.amount}. את הפרס אוספים בהצגת טופס המקור ותעודת זהות. קבעו מועד איסוף באפליקציה.`,
  },
  claim_reminder: {
    mandatory: true,
    defaultChannels: ['push', 'sms'],
    title: () => 'הפרס שלך עדיין ממתין ⏰',
    body: (p) => `הפרס בסך ₪${p.amount} ניתן לאיסוף עד ${p.expiresOn}. קבעו מועד איסוף באפליקציה.`,
  },
  withdrawal_paid: {
    mandatory: false,
    defaultChannels: ['push'],
    title: () => 'המשיכה בוצעה',
    body: (p) => `₪${p.amount} הועברו אליך.`,
  },
  withdrawal_rejected: {
    mandatory: false,
    defaultChannels: ['push'],
    title: () => 'בקשת המשיכה נדחתה',
    body: (p) => `בקשת המשיכה על ₪${p.amount} נדחתה${p.reason ? `: ${p.reason}` : ''}. הסכום הוחזר לארנק שלך.`,
  },
  card_credit_paid: {
    mandatory: false,
    defaultChannels: ['push'],
    title: () => 'הזכייה הועברה לכרטיס האשראי',
    body: (p) => `₪${p.amount} מהזכייה שלך הועברו לכרטיס האשראי השמור.`,
  },
  deposit_receipt: {
    // A record of money received: sent regardless of marketing-style preferences
    mandatory: true,
    defaultChannels: ['push'],
    title: () => 'הפקדה התקבלה',
    body: (p) => `הפקדה בסך ₪${p.amount} נוספה לארנק שלך.`,
  },
  order_lost: {
    mandatory: false,
    defaultChannels: ['push'],
    title: () => 'תוצאות הגרלה',
    body: () => 'לא הייתה זכייה הפעם. בהצלחה בפעם הבאה!',
  },
  results_delayed: {
    mandatory: false,
    defaultChannels: ['push'],
    title: () => 'תוצאות מתעכבות',
    body: () => 'בדיקת התוצאות נמשכת, ננסה שוב בקרוב.',
  },
};

export function isMandatoryTemplate(name: NotificationTemplateName): boolean {
  return NOTIFICATION_TEMPLATES[name].mandatory;
}

export function renderNotification<T extends NotificationTemplateName>(
  name: T,
  params: NotificationTemplateParams[T],
): { title: string; body: string } {
  const def = NOTIFICATION_TEMPLATES[name] as unknown as TemplateDef<T>;
  return { title: def.title(params), body: def.body(params) };
}
