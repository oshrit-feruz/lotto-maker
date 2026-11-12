// @vitest-environment node
// Reads the backend's schema and source, so it runs in Node rather than jsdom.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ACTOR_TYPE_LABEL,
  AUDIT_ACTION_LABEL,
  CARD_CREDIT_STATUS_LABEL,
  CLAIM_STATUS_LABEL,
  DRAW_STATUS_LABEL,
  ENTITY_LABEL,
  KYC_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  QUEUE_SLOT_STATUS_LABEL,
  TX_TYPE_LABEL,
  USER_STATUS_LABEL,
  auditActionLabel,
  labelOf,
} from './labels';
import { WITHDRAWAL_STATUS_LABEL } from './withdrawals';

const backend = fileURLToPath(new URL('../../../backend/', import.meta.url));
const schema = readFileSync(join(backend, 'prisma/schema.prisma'), 'utf8');

/** The values of `enum <name> { ... }` in schema.prisma, comments skipped. */
function enumValues(name: string): string[] {
  const m = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(schema);
  if (!m) throw new Error(`enum ${name} not found`);
  return m[1]!
    .split('\n')
    .map((l) => l.replace(/\/\/.*/, '').trim())
    .filter(Boolean);
}

describe('enum labels cover every backend value', () => {
  const cases: Array<[string, Record<string, string>]> = [
    ['OrderStatus', ORDER_STATUS_LABEL],
    ['WalletTransactionType', TX_TYPE_LABEL],
    ['DrawStatus', DRAW_STATUS_LABEL],
    ['PrizeClaimStatus', CLAIM_STATUS_LABEL],
    ['PendingCardCreditStatus', CARD_CREDIT_STATUS_LABEL],
    ['WithdrawalStatus', WITHDRAWAL_STATUS_LABEL],
    ['PaymentStatus', PAYMENT_STATUS_LABEL],
    ['QueueSlotStatus', QUEUE_SLOT_STATUS_LABEL],
    ['KycCheckStatus', KYC_STATUS_LABEL],
    ['UserStatus', USER_STATUS_LABEL],
  ];
  it.each(cases)('%s', (name, map) => {
    const values = enumValues(name);
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) expect(map[v], `${name}.${v}`).toMatch(/[֐-׿]/);
  });
});

/** Every `action: '...'` / `action: \`...\`` literal and entityType in the backend source. */
function backendAuditStrings() {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.ts') && !/\.(test|spec)\.ts$/.test(p)) files.push(p);
    }
  };
  walk(join(backend, 'src'));
  const actions = new Set<string>();
  const entities = new Set<string>();
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/action: (?:[^'`\n]*\? )?['`]([^'`]+)['`](?: : ['`]([^'`]+)['`])?/g)) {
      actions.add(m[1]!);
      if (m[2]) actions.add(m[2]);
    }
    for (const m of src.matchAll(/entityType: '([a-z_]+)'/g)) entities.add(m[1]!);
  }
  return { actions, entities };
}

describe('audit labels', () => {
  const { actions, entities } = backendAuditStrings();

  it('finds the backend actions', () => {
    expect(actions.size).toBeGreaterThan(30);
    expect(actions.has('draw:results_confirmed')).toBe(true);
  });

  it('labels every backend action in Hebrew', () => {
    // Template parts such as `${claim.status}` stand for a status: try each one.
    const statuses = ['pending', 'requested', 'approved', 'awaiting_pickup', 'scheduled', 'waiting', 'verified', 'rejected', 'manual_review'];
    for (const a of actions) {
      const concrete = a.includes('${') ? statuses.map((s) => a.replace(/\$\{[^}]+\}/g, s)) : [a];
      const labelled = concrete.filter((c) => /[֐-׿]/.test(auditActionLabel(c)) && !/[a-z]{3,}/.test(auditActionLabel(c)));
      expect(labelled.length, a).toBeGreaterThan(0);
    }
  });

  it('labels every entity type', () => {
    for (const e of entities) expect(ENTITY_LABEL[e], e).toBeDefined();
  });

  it('reads transitions with Hebrew statuses', () => {
    expect(auditActionLabel('withdrawal:requested->approved')).toBe('משיכה: ממתינה לאישור ← אושרה');
    expect(auditActionLabel('status_change:pending->in_queue')).toBe('הזמנה: ממתינה ← בתור');
    expect(auditActionLabel('status_change:->refunded')).toBe('הזמנה: הוחזרה');
    expect(auditActionLabel('prize_claim:awaiting_pickup->collected')).toBe('זכייה לאיסוף: ממתין לאיסוף ← נאסף');
    expect(auditActionLabel('withdrawal:approved')).toBe('משיכה: אושרה');
  });

  it('uses the fixed labels', () => {
    expect(auditActionLabel('draw:results_confirmed')).toBe(AUDIT_ACTION_LABEL['draw:results_confirmed']);
    expect(auditActionLabel('user:suspended')).toBe('השעיית משתמש');
  });

  it('never returns inherited Object.prototype values', () => {
    for (const a of ['constructor', '__proto__', 'toString', 'constructor:x', '__proto__:x', 'hasOwnProperty:a->b']) {
      expect(auditActionLabel(a), a).toBe(a);
    }
    expect(auditActionLabel('draw:constructor')).toBe('draw:constructor');
    expect(auditActionLabel('withdrawal:__proto__->approved')).toBe('משיכה: __proto__ ← אושרה');
    expect(auditActionLabel('withdrawal:requested->constructor')).toBe('משיכה: ממתינה לאישור ← constructor');
  });

  it('falls back to the raw action', () => {
    expect(auditActionLabel('something_new')).toBe('something_new');
    expect(auditActionLabel('draw:brand_new_thing')).toBe('draw:brand_new_thing');
    expect(auditActionLabel('unknown:a->b')).toBe('unknown:a->b');
  });
});

describe('labelOf', () => {
  it('returns the label, the raw value when unknown, and a dash when empty', () => {
    expect(labelOf(TX_TYPE_LABEL, 'withdrawal_hold')).toBe('משיכה (הקפאה)');
    expect(labelOf(TX_TYPE_LABEL, 'brand_new')).toBe('brand_new');
    expect(labelOf(TX_TYPE_LABEL, 'constructor')).toBe('constructor');
    expect(labelOf(TX_TYPE_LABEL, '__proto__')).toBe('__proto__');
    expect(labelOf(DRAW_STATUS_LABEL, 'toString')).toBe('toString');
    expect(labelOf(ACTOR_TYPE_LABEL, null)).toBe('—');
  });
});
