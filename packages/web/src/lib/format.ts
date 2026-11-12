/** Parses a money value from the API (strings like "12.50", or numbers). NaN-safe: returns null. */
export function toAmount(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * "₪1,234.50". Formatted by hand, not with Intl, so the server and every
 * browser produce the same string (no hydration mismatch). Unknown → "—".
 */
export function formatShekel(value: string | number | null | undefined): string {
  const n = toAmount(value);
  if (n === null) return '—';
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  const grouped = Number(int).toLocaleString('en-US');
  return `${n < 0 ? '-' : ''}₪${grouped}.${dec}`;
}

const dateTime = new Intl.DateTimeFormat('he-IL', {
  timeZone: 'Asia/Jerusalem',
  weekday: 'long',
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const dateOnly = new Intl.DateTimeFormat('he-IL', {
  timeZone: 'Asia/Jerusalem',
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
});

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return Number.isNaN(d.getTime()) ? '—' : dateTime.format(d);
}

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return Number.isNaN(d.getTime()) ? '—' : dateOnly.format(d);
}

const NBSP = '\u00a0';

/** Parts of an instant in Asia/Jerusalem, zero-padded, 24h. */
function jerusalemParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { day: get('day'), month: get('month'), year: get('year'), hour: get('hour'), minute: get('minute') };
}

/**
 * "11.11.2026 08:10" in Asia/Jerusalem: no weekday and no comma, with a no-break space so it never
 * wraps into ",11.11.2026" in a narrow RTL cell. For tables and lists.
 */
export function formatShortDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  const p = jerusalemParts(d);
  return `${p.day}.${p.month}.${p.year}${NBSP}${p.hour}:${p.minute}`;
}

/** A whole count with thousands separators: 57052 → "57,052". Formatted by hand, like formatShekel. */
export function formatCount(value: number | string | null | undefined): string {
  const n = toAmount(value);
  if (n === null) return '—';
  const sign = n < 0 ? '-' : '';
  return sign + String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
