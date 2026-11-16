import { randomUUID } from 'crypto';
import type { SmsProvider, SmsSendOptions } from './provider.js';

/** Dev: prints what would have been sent. Never prints a sensitive body (an OTP code). */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console' as const;
  async send(to: string, body: string, opts: SmsSendOptions = {}): Promise<{ id: string }> {
    console.log(`[DEV] sms → ${to}: ${opts.sensitive ? '[hidden]' : body}`);
    return { id: `console-${randomUUID()}` };
  }
}
