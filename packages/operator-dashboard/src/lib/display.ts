import { GAME_DISPLAY_NAMES, getSystematicRule } from '@lotto-maker/shared';
import type { QueueSlotWithOrder } from '../api/client.js';

/** The form to key, as the operator reads it: game, double, Extra. */
export function slotTitle(order: QueueSlotWithOrder['order']): string {
  const gameName = GAME_DISPLAY_NAMES[order.gameType as keyof typeof GAME_DISPLAY_NAMES] ?? order.gameType;
  const typeDisplay = order.ticketType === 'double' ? ' כפול' : '';
  const extraDisplay = order.extra ? ' + Extra' : '';
  return `${gameName}${typeDisplay}${extraDisplay}`;
}

/** A systematic form's Hebrew label (e.g. "שיטתי 8"), or the raw id when it is not a known rule. */
export function systematicLabel(id: string | null): string | null {
  if (!id) return null;
  return getSystematicRule(id)?.label ?? id;
}

export const SLOT_STATUS_LABEL: Record<string, string> = {
  waiting: 'ממתין',
  in_progress: 'בהקלדה',
  done: 'הוקלד, ממתין לסריקה',
};

export const pad2 = (n: number) => String(n).padStart(2, '0');

type Table = QueueSlotWithOrder['order']['tables'][number];

/** The form's tables, numbered from 1 as printed, with a stable React key built from their numbers. */
export function numberedTables(tables: readonly Table[]): Array<{ no: number; key: string; label: string } & Table> {
  const seen = new Map<string, number>();
  return tables.map((t, i) => {
    const base = `${t.numbers.join(',')}|${t.strongNumbers.join(',')}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const strong = t.strongNumbers.length > 0 ? ` | חזק: ${t.strongNumbers.join(', ')}` : '';
    return { ...t, no: i + 1, key: `${base}#${count}`, label: `טבלה ${i + 1}: ${t.numbers.join(', ')}${strong}` };
  });
}
