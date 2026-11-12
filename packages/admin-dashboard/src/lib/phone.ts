/** Accepts 05X-XXXXXXX or +9725XXXXXXXX and returns E.164. */
export function toE164(input: string): string {
  const d = input.replace(/[\s-]/g, '');
  if (d.startsWith('+')) return d;
  if (d.startsWith('0')) return `+972${d.slice(1)}`;
  return `+${d}`;
}
