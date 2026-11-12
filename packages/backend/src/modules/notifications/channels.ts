import type { NotificationChannelName, NotificationTemplateName } from '@lotto-maker/shared';
import { config } from '../../config.js';
import { AppError } from '../../plugins/error-handler.js';
import { notificationService } from '../../services/notifications.js';

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

export class TwilioSmsChannel implements NotificationChannel {
  readonly channel = 'sms' as const;
  async send(m: OutboundMessage): Promise<void> {
    if (!m.to) throw new Error('NO_RECIPIENT');
    if (!config.TWILIO_ACCOUNT_SID || !config.TWILIO_AUTH_TOKEN || !config.TWILIO_FROM_NUMBER) {
      throw new AppError(503, 'SMS_NOT_CONFIGURED', 'SMS provider is not configured');
    }
    const { default: twilio } = await import('twilio');
    const client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
    await client.messages.create({ body: m.body, from: config.TWILIO_FROM_NUMBER, to: m.to });
  }
}

/** Push through the existing FCM service (which logs to the console when Firebase is not configured). */
export class FcmPushChannel implements NotificationChannel {
  readonly channel = 'push' as const;
  async send(m: OutboundMessage): Promise<void> {
    if (!m.userId) throw new Error('NO_RECIPIENT');
    await notificationService.sendToUser(m.userId, {
      title: m.title,
      body: m.body,
      data: { type: m.template.toUpperCase(), ...(m.data ?? {}) },
    });
  }
}

/** No email provider exists yet: fails in production so the attempt shows up as `failed` in the log. */
export class UnconfiguredEmailChannel implements NotificationChannel {
  readonly channel = 'email' as const;
  async send(): Promise<void> {
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
    channels = { sms: new TwilioSmsChannel(), email: new UnconfiguredEmailChannel(), push: new FcmPushChannel() };
  } else {
    const twilioReady = config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN && config.TWILIO_FROM_NUMBER;
    channels = {
      sms: twilioReady ? new TwilioSmsChannel() : new ConsoleChannel('sms'),
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
