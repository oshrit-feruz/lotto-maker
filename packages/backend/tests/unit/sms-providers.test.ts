import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ConsoleSmsProvider,
  createSmsProvider,
  InforuSmsProvider,
  INFORU_URL,
  missingSmsSettings,
  resolveSmsProviderName,
  Sms019Provider,
  SMS019_URL,
  SmsProviderError,
  TwilioSmsProvider,
  type SmsProviderEnv,
} from '../../src/modules/notifications/sms/index.js';
import { SmsChannel, UnconfiguredSmsChannel } from '../../src/modules/notifications/channels.js';
import { AppError } from '../../src/plugins/error-handler.js';

// channels.ts pulls in the push service, which imports Prisma: keep it from loading an engine
vi.mock('../../src/prisma.js', () => ({ prisma: {} }));

const TO = '+972501234567';
const BODY = 'קוד האימות שלך: 123456';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const respond = (status: number, body: string) => fetchMock.mockResolvedValueOnce(new Response(body, { status }));

/** A fetch that never answers, but rejects like the real one when its signal aborts. */
function hang() {
  fetchMock.mockImplementationOnce(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }),
  );
}

function lastCall(): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: String(url), init: init! };
}

/** The error must not leak the body, the code, the number or a credential. */
async function expectRedactedError(p: Promise<unknown>, secrets: string[], match: RegExp) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(SmsProviderError);
  const msg = (err as Error).message;
  expect(msg).toMatch(match);
  for (const s of [BODY, '123456', TO, '0501234567', ...secrets]) expect(msg).not.toContain(s);
}

describe('twilio', () => {
  const p = () => new TwilioSmsProvider({ accountSid: 'AC123', authToken: 'tw-secret', from: '+15550001111' });

  it('posts the REST request and returns the sid', async () => {
    respond(201, JSON.stringify({ sid: 'SM42', status: 'queued' }));
    await expect(p().send(TO, BODY)).resolves.toEqual({ id: 'SM42' });
    const { url, init } = lastCall();
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('AC123:tw-secret').toString('base64')}`);
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const form = new URLSearchParams(String(init.body));
    expect(Object.fromEntries(form)).toEqual({ To: TO, From: '+15550001111', Body: BODY });
  });

  it('throws a redacted error on non-2xx', async () => {
    respond(400, JSON.stringify({ code: 21211, message: `The 'To' number ${TO} is not valid.` }));
    await expectRedactedError(p().send(TO, BODY), ['tw-secret'], /twilio HTTP 400 code 21211/);
  });

  it('throws on a timeout', async () => {
    vi.useFakeTimers();
    hang();
    const sent = p().send(TO, BODY);
    const check = expectRedactedError(sent, ['tw-secret'], /twilio timeout after 10000ms/);
    await vi.advanceTimersByTimeAsync(10_000);
    await check;
  });

  it('is 503 SMS_NOT_CONFIGURED without credentials, without calling fetch', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(new TwilioSmsProvider({ accountSid: 'AC1' }).send(TO, BODY)).rejects.toMatchObject({
      statusCode: 503,
      code: 'SMS_NOT_CONFIGURED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('inforu', () => {
  const p = (timeoutMs?: number) =>
    new InforuSmsProvider({ username: 'me', apiToken: 'inf-secret', sender: 'LottoMaker', timeoutMs });

  it('posts the documented XML as InforuXML and returns its own message id', async () => {
    respond(200, '<Result><Status>1</Status><Description>Message accepted successfully</Description><NumberOfRecipients>1</NumberOfRecipients></Result>');
    const { id } = await p().send(TO, 'a < b & "c"');
    const { url, init } = lastCall();
    expect(url).toBe(INFORU_URL);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toMatch(/^application\/x-www-form-urlencoded/);
    const xml = new URLSearchParams(String(init.body)).get('InforuXML')!;
    expect(xml).toBe(
      '<Inforu><User><Username>me</Username><ApiToken>inf-secret</ApiToken></User>' +
        '<Content Type="sms"><Message>a &lt; b &amp; &quot;c&quot;</Message></Content>' +
        '<Recipients><PhoneNumber>0501234567</PhoneNumber></Recipients>' +
        `<Settings><Sender>LottoMaker</Sender><CustomerMessageID>${id}</CustomerMessageID></Settings></Inforu>`,
    );
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('throws on a negative Status with a known description', async () => {
    respond(200, '<Result><Status>-2</Status><Description>Bad user name or password</Description></Result>');
    await expectRedactedError(p().send(TO, BODY), ['inf-secret'], /inforu status -2 \(bad username or token\)/);
  });

  it('throws on non-2xx', async () => {
    respond(500, `<html>${BODY}</html>`);
    await expectRedactedError(p().send(TO, BODY), ['inf-secret'], /inforu HTTP 500/);
  });

  it('throws on a reply without Status', async () => {
    respond(200, 'OK');
    await expectRedactedError(p().send(TO, BODY), [], /unexpected response/);
  });

  it('throws on a timeout (configurable)', async () => {
    vi.useFakeTimers();
    hang();
    const check = expectRedactedError(p(3000).send(TO, BODY), ['inf-secret'], /inforu timeout after 3000ms/);
    await vi.advanceTimersByTimeAsync(3000);
    await check;
  });

  it('refuses a non-Israeli number without calling fetch', async () => {
    await expectRedactedError(p().send('+15550001111', BODY), [], /unsupported destination/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is 503 without a sender', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(new InforuSmsProvider({ username: 'me', apiToken: 't' }).send(TO, BODY)).rejects.toMatchObject({
      statusCode: 503,
      code: 'SMS_NOT_CONFIGURED',
    });
  });
});

describe('sms019', () => {
  const p = (apiUrl?: string) =>
    new Sms019Provider({ username: 'me', apiToken: '019-secret', sender: '0501112222', apiUrl });

  it('posts the documented JSON with a Bearer token and returns shipment_id', async () => {
    respond(200, JSON.stringify({ status: 0, message: 'SMS will be sent', shipment_id: 778899 }));
    await expect(p().send(TO, BODY)).resolves.toEqual({ id: '778899' });
    const { url, init } = lastCall();
    expect(url).toBe(SMS019_URL);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer 019-secret');
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual({
      sms: {
        user: { username: 'me' },
        source: '0501112222',
        destinations: { phone: [{ _: '0501234567' }] },
        message: BODY,
      },
    });
  });

  it('uses the test endpoint when configured', async () => {
    respond(200, JSON.stringify({ status: 0, shipment_id: 'x' }));
    await p('https://019sms.co.il/api/test').send(TO, BODY);
    expect(lastCall().url).toBe('https://019sms.co.il/api/test');
  });

  it('throws on a non-zero status', async () => {
    respond(200, JSON.stringify({ status: 4, message: 'Not enough credit' }));
    await expectRedactedError(p().send(TO, BODY), ['019-secret'], /sms019 status 4 \(not enough credit\)/);
  });

  it('throws on non-2xx and on non-JSON', async () => {
    respond(502, 'Bad gateway');
    await expectRedactedError(p().send(TO, BODY), ['019-secret'], /sms019 HTTP 502/);
    respond(200, '<xml/>');
    await expectRedactedError(p().send(TO, BODY), ['019-secret'], /not JSON/);
  });

  it('throws on a timeout', async () => {
    vi.useFakeTimers();
    hang();
    const check = expectRedactedError(p().send(TO, BODY), ['019-secret'], /sms019 timeout after 10000ms/);
    await vi.advanceTimersByTimeAsync(10_000);
    await check;
  });

  it('throws a redacted error on a network failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError(`fetch failed for ${BODY}`));
    await expectRedactedError(p().send(TO, BODY), ['019-secret'], /sms019 network error \(TypeError\)/);
  });
});

describe('console provider and SMS channel', () => {
  it('hides a sensitive body', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const channel = new SmsChannel(new ConsoleSmsProvider());
    await channel.send({ userId: null, to: TO, template: 'otp', title: 'קוד', body: BODY });
    await channel.send({ userId: null, to: TO, template: 'order_won', title: 'זכייה', body: 'זכית ב-₪120' });
    expect(log.mock.calls.map((c) => String(c[0]))).toEqual([
      `[DEV] sms → ${TO}: [hidden]`,
      `[DEV] sms → ${TO}: זכית ב-₪120`,
    ]);
  });

  it('real providers never log the body', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    respond(200, JSON.stringify({ status: 3 }));
    const channel = new SmsChannel(new Sms019Provider({ username: 'me', apiToken: 't', sender: 'Lotto' }));
    await expect(channel.send({ userId: null, to: TO, template: 'otp', title: 'קוד', body: BODY })).rejects.toThrow();
    for (const s of spies) for (const call of s.mock.calls) expect(JSON.stringify(call)).not.toContain('123456');
  });

  it('the unconfigured channel fails with 503', async () => {
    await expect(new UnconfiguredSmsChannel().send()).rejects.toBeInstanceOf(AppError);
    await expect(new UnconfiguredSmsChannel().send()).rejects.toMatchObject({ statusCode: 503, code: 'SMS_NOT_CONFIGURED' });
  });
});

describe('provider selection', () => {
  const twilio = { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM_NUMBER: '+15550001111' };
  const env = (e: Partial<SmsProviderEnv>): SmsProviderEnv => ({ NODE_ENV: 'development', ...e });

  it('defaults to console outside production and to none in production', () => {
    expect(resolveSmsProviderName(env({}))).toBe('console');
    expect(resolveSmsProviderName(env({ NODE_ENV: 'test' }))).toBe('console');
    expect(resolveSmsProviderName(env({ NODE_ENV: 'production' }))).toBeNull();
    expect(createSmsProvider(env({ NODE_ENV: 'production' }))).toBeNull();
    expect(createSmsProvider(env({}))).toBeInstanceOf(ConsoleSmsProvider);
  });

  it('uses twilio when every TWILIO_* is set and SMS_PROVIDER is unset (backwards compatible)', () => {
    expect(resolveSmsProviderName(env({ ...twilio }))).toBe('twilio');
    expect(resolveSmsProviderName(env({ NODE_ENV: 'production', ...twilio }))).toBe('twilio');
    expect(createSmsProvider(env({ ...twilio }))).toBeInstanceOf(TwilioSmsProvider);
    expect(resolveSmsProviderName(env({ TWILIO_ACCOUNT_SID: 'AC1' }))).toBe('console');
  });

  it('SMS_PROVIDER wins over TWILIO_*', () => {
    expect(createSmsProvider(env({ ...twilio, SMS_PROVIDER: 'inforu' }))).toBeInstanceOf(InforuSmsProvider);
    expect(createSmsProvider(env({ ...twilio, SMS_PROVIDER: 'sms019' }))).toBeInstanceOf(Sms019Provider);
    expect(createSmsProvider(env({ ...twilio, SMS_PROVIDER: 'console' }))).toBeInstanceOf(ConsoleSmsProvider);
  });

  it('lists the missing settings per provider', () => {
    expect(missingSmsSettings(env({}), 'inforu')).toEqual(['INFORU_USERNAME', 'INFORU_TOKEN', 'SMS_SENDER']);
    expect(missingSmsSettings(env({}), 'sms019')).toEqual(['SMS019_USERNAME', 'SMS019_TOKEN', 'SMS_SENDER']);
    expect(missingSmsSettings(env({ TWILIO_ACCOUNT_SID: 'a', TWILIO_AUTH_TOKEN: 'b', SMS_SENDER: 'Lotto' }), 'twilio')).toEqual([]);
    expect(missingSmsSettings(env({}), 'console')).toEqual([]);
  });
});
