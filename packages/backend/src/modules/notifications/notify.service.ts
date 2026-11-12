import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TEMPLATES,
  isMandatoryTemplate,
  renderNotification,
} from '@lotto-maker/shared';
import type {
  NotificationChannelName,
  NotificationTemplateName,
  NotificationTemplateParams,
} from '@lotto-maker/shared';
import { prisma } from '../../prisma.js';
import { getChannels } from './channels.js';

export interface NotifyOptions {
  /** Override the template's default channels. */
  channels?: readonly NotificationChannelName[];
  /** Phone / address, for a recipient that has no account yet (an OTP at sign-up). */
  to?: string;
}

async function record(
  userId: string | null,
  channel: NotificationChannelName,
  template: NotificationTemplateName,
  payload: object,
  status: 'sent' | 'failed' | 'skipped',
  error?: string,
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId,
        channel,
        template,
        payload,
        status,
        sentAt: status === 'sent' ? new Date() : null,
        error: error ?? null,
      },
    });
  } catch (err) {
    console.error('[notify] could not log notification:', err);
  }
}

async function sendOne(
  userId: string | null,
  channelName: NotificationChannelName,
  template: NotificationTemplateName,
  params: object,
  opts: NotifyOptions,
): Promise<void> {
  // An OTP code must never be written to the log table
  const payload = template === 'otp' ? {} : params;

  if (!isMandatoryTemplate(template) && userId) {
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId_channel: { userId, channel: channelName } },
    });
    if (pref && !pref.enabled) {
      await record(userId, channelName, template, payload, 'skipped', 'OPTED_OUT');
      return;
    }
  }

  let to = opts.to;
  if (!to && channelName === 'sms' && userId) {
    to = (await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } }))?.phone;
  }
  const noRecipient =
    (channelName === 'push' && !userId) || (channelName === 'sms' && !to) || (channelName === 'email' && !to);
  if (noRecipient) {
    await record(userId, channelName, template, payload, 'skipped', 'NO_RECIPIENT');
    return;
  }

  const { title, body } = renderNotification(template, params as never);
  try {
    await getChannels()[channelName].send({ userId, to, template, title, body });
  } catch (err) {
    await record(userId, channelName, template, payload, 'failed', err instanceof Error ? err.message : String(err));
    return;
  }
  await record(userId, channelName, template, payload, 'sent');
}

/**
 * Sends a templated notification on the template's channels, honouring the user's opt-outs
 * (OTP and legal notices ignore them) and logging every attempt in `Notification`.
 *
 * NEVER throws: a failed send is logged and swallowed so it cannot fail the business
 * transaction that triggered it. Call it after the transaction has committed.
 */
export async function notify<T extends NotificationTemplateName>(
  userId: string | null,
  template: T,
  params: NotificationTemplateParams[T],
  opts: NotifyOptions = {},
): Promise<void> {
  try {
    const names = opts.channels ?? NOTIFICATION_TEMPLATES[template].defaultChannels;
    for (const channelName of names) {
      try {
        await sendOne(userId, channelName, template, params, opts);
      } catch (err) {
        console.error(`[notify] ${template} via ${channelName} failed:`, err);
      }
    }
  } catch (err) {
    console.error(`[notify] ${template} failed:`, err);
  }
}

/** Fire and forget: for call sites that should not wait for the channels. */
export function notifyInBackground<T extends NotificationTemplateName>(
  userId: string | null,
  template: T,
  params: NotificationTemplateParams[T],
  opts: NotifyOptions = {},
): void {
  void notify(userId, template, params, opts).catch(console.error);
}

// ─── Preferences ─────────────────────────────────────────────────────────────

export type NotificationPreferences = Record<NotificationChannelName, boolean>;

export async function getPreferences(userId: string): Promise<NotificationPreferences> {
  const rows = await prisma.notificationPreference.findMany({ where: { userId } });
  const prefs = Object.fromEntries(NOTIFICATION_CHANNELS.map((c) => [c, true])) as NotificationPreferences;
  for (const r of rows) prefs[r.channel] = r.enabled;
  return prefs;
}

export async function setPreferences(
  userId: string,
  changes: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  for (const channel of NOTIFICATION_CHANNELS) {
    const enabled = changes[channel];
    if (enabled === undefined) continue;
    await prisma.notificationPreference.upsert({
      where: { userId_channel: { userId, channel } },
      create: { userId, channel, enabled },
      update: { enabled },
    });
  }
  return getPreferences(userId);
}
