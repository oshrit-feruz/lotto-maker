import { ConsoleSmsProvider } from './console.js';
import { InforuSmsProvider } from './inforu.js';
import { Sms019Provider } from './sms019.js';
import { TwilioSmsProvider } from './twilio.js';
import { resolveSmsProviderName, type SmsEnv } from './select.js';
import type { SmsProvider } from './provider.js';

export * from './provider.js';
export * from './select.js';
export * from './console.js';
export * from './inforu.js';
export * from './sms019.js';
export * from './twilio.js';

export interface SmsProviderEnv extends SmsEnv {
  SMS_TIMEOUT_MS?: number;
  SMS019_API_URL?: string;
}

/** The configured provider, or null in production when none is configured. */
export function createSmsProvider(env: SmsProviderEnv): SmsProvider | null {
  const timeoutMs = env.SMS_TIMEOUT_MS;
  switch (resolveSmsProviderName(env)) {
    case 'console':
      return new ConsoleSmsProvider();
    case 'twilio':
      return new TwilioSmsProvider({
        accountSid: env.TWILIO_ACCOUNT_SID,
        authToken: env.TWILIO_AUTH_TOKEN,
        from: env.TWILIO_FROM_NUMBER ?? env.SMS_SENDER,
        timeoutMs,
      });
    case 'inforu':
      return new InforuSmsProvider({
        username: env.INFORU_USERNAME,
        apiToken: env.INFORU_TOKEN,
        sender: env.SMS_SENDER,
        timeoutMs,
      });
    case 'sms019':
      return new Sms019Provider({
        username: env.SMS019_USERNAME,
        apiToken: env.SMS019_TOKEN,
        sender: env.SMS_SENDER,
        apiUrl: env.SMS019_API_URL,
        timeoutMs,
      });
    case null:
      return null;
  }
}
