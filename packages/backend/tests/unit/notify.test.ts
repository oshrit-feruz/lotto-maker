import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NOTIFICATION_TEMPLATES, isMandatoryTemplate, renderNotification } from '@lotto-maker/shared';

/* eslint-disable @typescript-eslint/no-explicit-any */
const h = vi.hoisted(() => {
  const s = { prefs: [] as any[], log: [] as any[], phone: '+972501234567' };
  const fake: any = {
    notificationPreference: {
      findUnique: async ({ where }: any) =>
        s.prefs.find((p) => p.userId === where.userId_channel.userId && p.channel === where.userId_channel.channel) ?? null,
      findMany: async ({ where }: any) => s.prefs.filter((p) => p.userId === where.userId),
      upsert: async ({ where, create, update }: any) => {
        const key = where.userId_channel;
        const row = s.prefs.find((p) => p.userId === key.userId && p.channel === key.channel);
        if (row) Object.assign(row, update);
        else s.prefs.push(create);
      },
    },
    notification: { create: async ({ data }: any) => void s.log.push(data) },
    user: { findUnique: async () => ({ phone: s.phone }) },
  };
  return { s, fake };
});

vi.mock('../../src/prisma.js', () => ({ prisma: h.fake }));

import { notify, getPreferences, setPreferences } from '../../src/modules/notifications/notify.service.js';
import { MockChannel, setChannelsForTests } from '../../src/modules/notifications/channels.js';

const channels = { sms: new MockChannel('sms'), email: new MockChannel('email'), push: new MockChannel('push') };

beforeEach(() => {
  setChannelsForTests(channels);
  h.s.prefs = [];
  h.s.log = [];
  for (const c of Object.values(channels)) {
    c.sent.length = 0;
    c.failWith = null;
  }
});

describe('templates', () => {
  it('renders Hebrew text with the parameters', () => {
    expect(renderNotification('otp', { code: '123456' }).body).toBe('קוד האימות שלך: 123456');
    expect(renderNotification('order_won', { amount: '120.00' }).body).toContain('₪120.00');
    expect(renderNotification('withdrawal_rejected', { amount: '50.00', reason: 'פרטי בנק שגויים' }).body).toContain(
      'פרטי בנק שגויים',
    );
  });

  it('has every template the spec asks for', () => {
    for (const t of [
      'otp',
      'order_scanned',
      'order_won',
      'big_prize_claim_created',
      'claim_reminder',
      'withdrawal_paid',
      'withdrawal_rejected',
      'card_credit_paid',
      'deposit_receipt',
    ] as const) {
      expect(NOTIFICATION_TEMPLATES[t]).toBeDefined();
    }
    expect(isMandatoryTemplate('otp')).toBe(true);
    expect(isMandatoryTemplate('order_won')).toBe(false);
  });
});

describe('notify', () => {
  it('sends on the template channels and logs every send', async () => {
    await notify('u1', 'order_won', { amount: '10.00' });
    expect(channels.push.sent).toHaveLength(1);
    expect(channels.push.sent[0]).toMatchObject({ userId: 'u1', template: 'order_won' });
    expect(h.s.log).toEqual([
      expect.objectContaining({ userId: 'u1', channel: 'push', template: 'order_won', status: 'sent', payload: { amount: '10.00' } }),
    ]);
    expect(h.s.log[0].sentAt).toBeInstanceOf(Date);
  });

  it('respects an opt-out and logs it as skipped', async () => {
    await setPreferences('u1', { push: false });
    await notify('u1', 'order_won', { amount: '10.00' });
    expect(channels.push.sent).toHaveLength(0);
    expect(h.s.log).toEqual([expect.objectContaining({ channel: 'push', status: 'skipped', error: 'OPTED_OUT' })]);
  });

  it('OTP ignores the opt-out, and never stores the code', async () => {
    await setPreferences('u1', { sms: false, push: false, email: false });
    await notify('u1', 'otp', { code: '654321' });
    expect(channels.sms.sent).toHaveLength(1);
    expect(channels.sms.sent[0]).toMatchObject({ to: h.s.phone });
    expect(channels.sms.sent[0]!.body).toContain('654321');
    expect(JSON.stringify(h.s.log)).not.toContain('654321');
    expect(h.s.log[0]).toMatchObject({ status: 'sent', payload: {} });
  });

  it('legal notices (prize claim) ignore the opt-out too', async () => {
    await setPreferences('u1', { sms: false, push: false });
    await notify('u1', 'big_prize_claim_created', { amount: '5000.00' });
    expect(channels.push.sent).toHaveLength(1);
    expect(channels.sms.sent).toHaveLength(1);
  });

  it('an OTP to a number without an account goes to `to`, with no user', async () => {
    await notify(null, 'otp', { code: '111111' }, { to: '+972509999999' });
    expect(channels.sms.sent[0]).toMatchObject({ userId: null, to: '+972509999999' });
  });

  it('a channel failure never throws; it is logged as failed and the other channels still go', async () => {
    channels.push.failWith = new Error('FCM down');
    await expect(notify('u1', 'claim_reminder', { amount: '5000.00', expiresOn: '1.1.2027' })).resolves.toBeUndefined();
    expect(h.s.log.map((l) => `${l.channel}:${l.status}`)).toEqual(['push:failed', 'sms:sent']);
    expect(h.s.log[0].error).toBe('FCM down');
  });

  it('never throws even when the log table is broken', async () => {
    h.fake.notification.create = async () => {
      throw new Error('db down');
    };
    await expect(notify('u1', 'order_won', { amount: '1.00' })).resolves.toBeUndefined();
    expect(channels.push.sent).toHaveLength(1);
    h.fake.notification.create = async ({ data }: any) => void h.s.log.push(data);
  });

  it('skips email when there is no address to send to', async () => {
    await notify('u1', 'order_won', { amount: '1.00' }, { channels: ['email'] });
    expect(channels.email.sent).toHaveLength(0);
    expect(h.s.log[0]).toMatchObject({ channel: 'email', status: 'skipped', error: 'NO_RECIPIENT' });
  });
});

describe('preferences', () => {
  it('default to on and change per channel', async () => {
    expect(await getPreferences('u1')).toEqual({ sms: true, email: true, push: true });
    expect(await setPreferences('u1', { email: false })).toEqual({ sms: true, email: false, push: true });
    expect(await setPreferences('u1', { email: true, sms: false })).toEqual({ sms: false, email: true, push: true });
  });
});
