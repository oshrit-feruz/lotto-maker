const nis = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Formats an amount (number or Decimal string) as `₪1,234.00`, or `-₪14.50` when negative. Render a
 * negative amount inside an LTR element (see `<Money>`), or RTL text moves the minus to the far side.
 */
export function formatNis(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  const v = Number.isFinite(n) ? n : 0;
  return `${v < 0 ? '-' : ''}₪${nis.format(Math.abs(v))}`;
}

const count = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** A whole count with thousands separators: `57,052`. */
export function formatCount(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return count.format(Number.isFinite(n) ? n : 0);
}

const jerusalemParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jerusalem',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Formats an ISO date in Asia/Jerusalem as `dd/mm/yyyy HH:mm` (zero-padded, 24h, no comma). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const parts = jerusalemParts.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  // A no-break space keeps the date and the time on one line in narrow table cells.
  return `${get('day')}/${get('month')}/${get('year')}\u00a0${get('hour')}:${get('minute')}`;
}

/** A `YYYY-MM-DD` value (from `<input type=date>`) as `dd/mm/yyyy`; '' when empty or malformed. */
export function formatDayInput(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
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
