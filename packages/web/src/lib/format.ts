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
