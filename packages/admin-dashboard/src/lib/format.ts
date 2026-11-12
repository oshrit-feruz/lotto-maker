const nis = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Formats an amount (number or Decimal string) as `₪1,234.00`. */
export function formatNis(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return `₪${nis.format(Number.isFinite(n) ? n : 0)}`;
}

const dateTime = new Intl.DateTimeFormat('he-IL', {
  timeZone: 'Asia/Jerusalem',
  dateStyle: 'short',
  timeStyle: 'short',
});

/** Formats an ISO date in Asia/Jerusalem. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateTime.format(d);
}

const jerusalemOffset = (at: Date): string => {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  return part && part !== 'GMT' ? part.replace('GMT', '') : 'Z';
};

/**
 * Converts a `datetime-local` value (`YYYY-MM-DDTHH:mm`) read as Asia/Jerusalem wall time to an
 * ISO instant. Returns null for an invalid value.
 */
export function jerusalemLocalToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const guess = new Date(`${local}:00Z`);
  if (Number.isNaN(guess.getTime())) return null;
  const d = new Date(`${local}:00${jerusalemOffset(guess)}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** The Asia/Jerusalem wall time of an instant, as a `datetime-local` value (`YYYY-MM-DDTHH:mm`). */
export function toJerusalemLocalInput(iso: string | Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
