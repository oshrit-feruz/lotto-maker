import type { NotificationChannelName, NotificationTemplateName } from '@lotto-maker/shared';
import { config } from '../../config.js';
import { AppError } from '../../plugins/error-handler.js';
import { notificationService } from '../../services/notifications.js';
import { createSmsProvider, type SmsProvider } from './sms/index.js';

export interface OutboundMessage {
  userId: string | null;
  /** Phone number (sms) or address (email). Push goes to the user's registered devices. */
  to?: string;
  template: NotificationTemplateName;
  title: string;
  body: string;
  data?: Record<string, string>;
}

/** One way of reaching a user. `send` throws if the message could not be handed over. */
export interface NotificationChannel {
  readonly channel: NotificationChannelName;
  send(message: OutboundMessage): Promise<void>;
}

/** Dev: prints what would have been sent. Never prints an OTP code. */
export class ConsoleChannel implements NotificationChannel {
  constructor(readonly channel: NotificationChannelName) {}
  async send(m: OutboundMessage): Promise<void> {
    const body = m.template === 'otp' ? '[hidden]' : m.body;
    console.log(`[DEV] ${this.channel} → ${m.to ?? m.userId ?? '?'}: ${m.title} — ${body}`);
  }
}

/** Tests: records every message; set `failWith` to make sends throw. */
export class MockChannel implements NotificationChannel {
  readonly sent: OutboundMessage[] = [];
  failWith: Error | null = null;
  constructor(readonly channel: NotificationChannelName) {}
  async send(m: OutboundMessage): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push(m);
  }
}

/** SMS through the configured provider (see ./sms). OTP bodies are marked sensitive. */
export class SmsChannel implements NotificationChannel {
  readonly channel = 'sms' as const;
  constructor(readonly provider: SmsProvider) {}
  async send(m: OutboundMessage): Promise<void> {
    if (!m.to) throw new Error('NO_RECIPIENT');
    await this.provider.send(m.to, m.body, { sensitive: m.template === 'otp' });
  }
}

/** Production without an SMS provider: every send fails with 503, as before SMS_PROVIDER existed. */
export class UnconfiguredSmsChannel implements NotificationChannel {
  readonly channel = 'sms' as const;
  async send(): Promise<void> {
    throw new AppError(503, 'SMS_NOT_CONFIGURED', 'SMS provider is not configured');
  }
}

/** The SMS channel for this config: the selected provider, or 503 on every send without one. */
export function createSmsChannel(): NotificationChannel {
  const provider = createSmsProvider(config);
  return provider ? new SmsChannel(provider) : new UnconfiguredSmsChannel();
}

/** Thrown by a channel that has nobody to deliver to (e.g. no registered device): logged as `skipped`. */
export class NoRecipientError extends Error {
  constructor(detail = 'NO_RECIPIENT') {
    super(detail);
    this.name = 'NoRecipientError';
  }
}

/**
 * Push through the FCM service. Resolves only when at least one device accepted the message:
 * no device -> NoRecipientError (skipped); every device failed -> throws (failed). Without
 * Firebase, production throws and dev prints to the console.
 */
export class FcmPushChannel implements NotificationChannel {
  readonly channel = 'push' as const;
  async send(m: OutboundMessage): Promise<void> {
    if (!m.userId) throw new NoRecipientError();
    const result = await notificationService.deliverToUser(m.userId, {
      title: m.title,
      body: m.body,
      data: { type: m.template.toUpperCase(), ...(m.data ?? {}) },
    });
    if (result.devices === 0) throw new NoRecipientError('NO_DEVICE_TOKENS');
    if (!result.configured) {
      if (config.NODE_ENV === 'production') {
        throw new AppError(503, 'PUSH_NOT_CONFIGURED', 'Push provider is not configured');
      }
      return; // dev: printed to the console
    }
    if (result.delivered === 0) {
      throw new Error(`PUSH_FAILED: 0 of ${result.devices} device(s) accepted the message`);
    }
  }
}

/**
 * No email provider exists yet. Every send throws, so the attempt is logged as `failed` (never
 * as sent), and it is reported on the server log as well.
 */
export class UnconfiguredEmailChannel implements NotificationChannel {
  readonly channel = 'email' as const;
  async send(m: OutboundMessage): Promise<void> {
    console.error(`[notify] email not sent (${m.template}): no email provider is configured`);
    throw new AppError(503, 'EMAIL_NOT_CONFIGURED', 'Email provider is not configured');
  }
}

export type ChannelSet = Record<NotificationChannelName, NotificationChannel>;

let channels: ChannelSet | null = null;

export function getChannels(): ChannelSet {
  if (channels) return channels;
  if (config.NODE_ENV === 'test') {
    channels = { sms: new MockChannel('sms'), email: new MockChannel('email'), push: new MockChannel('push') };
  } else if (config.NODE_ENV === 'production') {
    channels = { sms: createSmsChannel(), email: new UnconfiguredEmailChannel(), push: new FcmPushChannel() };
  } else {
    channels = {
      sms: createSmsChannel(),
      email: new ConsoleChannel('email'),
      push: new FcmPushChannel(),
    };
  }
  return channels;
}

/** Tests only: replace the channels (null resets to the configured ones). */
export function setChannelsForTests(set: ChannelSet | null): void {
  channels = set;
}
