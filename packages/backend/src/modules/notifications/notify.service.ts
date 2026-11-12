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
import { AppError } from '../../plugins/error-handler.js';
import { getChannels, NoRecipientError } from './channels.js';

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

type SendOutcome =
  | { status: 'sent' }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: unknown };

async function sendOne(
  userId: string | null,
  channelName: NotificationChannelName,
  template: NotificationTemplateName,
  params: object,
  opts: NotifyOptions,
): Promise<SendOutcome> {
  // An OTP code must never be written to the log table
  const payload = template === 'otp' ? {} : params;
  const skip = async (reason: string): Promise<SendOutcome> => {
    await record(userId, channelName, template, payload, 'skipped', reason);
    return { status: 'skipped', reason };
  };

  if (!isMandatoryTemplate(template) && userId) {
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId_channel: { userId, channel: channelName } },
    });
    if (pref && !pref.enabled) return skip('OPTED_OUT');
  }

  let to = opts.to;
  if (!to && channelName === 'sms' && userId) {
    to = (await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } }))?.phone;
  }
  const noRecipient =
    (channelName === 'push' && !userId) || (channelName === 'sms' && !to) || (channelName === 'email' && !to);
  if (noRecipient) return skip('NO_RECIPIENT');

  const { title, body } = renderNotification(template, params as never);
  try {
    await getChannels()[channelName].send({ userId, to, template, title, body });
  } catch (err) {
    // e.g. a push to a user with no registered device
    if (err instanceof NoRecipientError) return skip(err.message);
    await record(userId, channelName, template, payload, 'failed', err instanceof Error ? err.message : String(err));
    return { status: 'failed', error: err };
  }
  await record(userId, channelName, template, payload, 'sent');
  return { status: 'sent' };
}

/**
 * Sends one templated message on one channel through the same logged path as `notify`, but
 * reports the failure to the caller: for messages the caller cannot go on without (the
 * sign-in OTP). Throws the channel's AppError as it is (e.g. 503 SMS_NOT_CONFIGURED), any other
 * failure as 502 NOTIFICATION_NOT_SENT.
 */
export async function sendRequired<T extends NotificationTemplateName>(
  userId: string | null,
  channel: NotificationChannelName,
  template: T,
  params: NotificationTemplateParams[T],
  opts: NotifyOptions = {},
): Promise<void> {
  const outcome = await sendOne(userId, channel, template, params, opts);
  if (outcome.status === 'sent') return;
  if (outcome.status === 'failed' && outcome.error instanceof AppError) throw outcome.error;
  throw new AppError(502, 'NOTIFICATION_NOT_SENT', 'The message could not be sent', {
    reason: outcome.status === 'skipped' ? outcome.reason : undefined,
  });
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
