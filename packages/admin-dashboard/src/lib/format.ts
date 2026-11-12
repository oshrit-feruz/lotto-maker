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

/** Converts a `YYYY-MM-DD` day to the ISO instant at its start (or end) in Asia/Jerusalem. */
export function jerusalemDayToIso(day: string, end = false): string {
  const time = end ? '23:59:59.999' : '00:00:00.000';
  const guess = new Date(`${day}T12:00:00Z`);
  const part = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', timeZoneName: 'longOffset' })
    .formatToParts(guess)
    .find((p) => p.type === 'timeZoneName')?.value;
  const off = part && part !== 'GMT' ? part.replace('GMT', '') : 'Z';
  return new Date(`${day}T${time}${off}`).toISOString();
}
