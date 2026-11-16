// Pure: imported by config.ts, so it must not import config (or anything that does).

export const SMS_PROVIDERS = ['console', 'twilio', 'inforu', 'sms019'] as const;
export type SmsProviderName = (typeof SMS_PROVIDERS)[number];

export interface SmsEnv {
  NODE_ENV: 'development' | 'test' | 'production';
  SMS_PROVIDER?: SmsProviderName;
  SMS_SENDER?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  INFORU_USERNAME?: string;
  INFORU_TOKEN?: string;
  SMS019_USERNAME?: string;
  SMS019_TOKEN?: string;
}

const twilioReady = (env: SmsEnv) => Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER);

/**
 * Which SMS provider sends: SMS_PROVIDER when set; otherwise Twilio when all TWILIO_* are set
 * (the behaviour before SMS_PROVIDER existed); otherwise `console` outside production and
 * none (null) in production, where every SMS then fails with 503 SMS_NOT_CONFIGURED.
 */
export function resolveSmsProviderName(env: SmsEnv): SmsProviderName | null {
  if (env.SMS_PROVIDER) return env.SMS_PROVIDER;
  if (twilioReady(env)) return 'twilio';
  return env.NODE_ENV === 'production' ? null : 'console';
}

/** The env vars the provider needs that are unset. */
export function missingSmsSettings(env: SmsEnv, provider: SmsProviderName): string[] {
  const need: [string, string | undefined][] =
    provider === 'twilio'
      ? [
          ['TWILIO_ACCOUNT_SID', env.TWILIO_ACCOUNT_SID],
          ['TWILIO_AUTH_TOKEN', env.TWILIO_AUTH_TOKEN],
          ['TWILIO_FROM_NUMBER (or SMS_SENDER)', env.TWILIO_FROM_NUMBER ?? env.SMS_SENDER],
        ]
      : provider === 'inforu'
        ? [
            ['INFORU_USERNAME', env.INFORU_USERNAME],
            ['INFORU_TOKEN', env.INFORU_TOKEN],
            ['SMS_SENDER', env.SMS_SENDER],
          ]
        : provider === 'sms019'
          ? [
              ['SMS019_USERNAME', env.SMS019_USERNAME],
              ['SMS019_TOKEN', env.SMS019_TOKEN],
              ['SMS_SENDER', env.SMS_SENDER],
            ]
          : [];
  return need.filter(([, v]) => !v).map(([name]) => name);
}

/** Sender ID rules of the Israeli gateways: up to 11 Latin letters/digits, or a number of up to 14 digits. */
export function smsSenderProblem(env: SmsEnv, provider: SmsProviderName): string | null {
  if (provider !== 'inforu' && provider !== 'sms019') return null;
  const s = env.SMS_SENDER;
  if (!s) return null;
  const maxDigits = provider === 'inforu' ? 14 : 11;
  if (/^\d+$/.test(s)) return s.length <= maxDigits ? null : `SMS_SENDER: a numeric sender is at most ${maxDigits} digits for ${provider}`;
  return /^[A-Za-z0-9]{1,11}$/.test(s)
    ? null
    : `SMS_SENDER: must be up to 11 Latin letters/digits without spaces, or digits only, for ${provider}`;
}
