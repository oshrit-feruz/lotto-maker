// Systematic (שיטתי) form types. A systematic form is equivalent to every
// 6-number combination it covers; its price is combinations × table price.
//
// TODO verify at terminal: every rule in this file. Only the `full` types are
// enabled; `6=5` and the strong variants stay disabled until their exact rules
// are confirmed. Each type has its own `enabled` flag.

export type SystematicKind =
  /** n numbers → every C(n,6) combination, one strong number. */
  | 'full'
  /** 6 numbers + n strong numbers → one combination per strong number. */
  | 'strong'
  /** Rule not known yet. Cannot be expanded. */
  | 'unknown';

export interface SystematicRule {
  id: string;
  label: string;
  kind: SystematicKind;
  /** Numbers the single table must contain (kind full / strong). */
  numbersCount?: number;
  /** Strong numbers the single table must contain (kind strong). */
  strongCount?: number;
  enabled: boolean;
}

export const SYSTEMATIC_RULES: Record<string, SystematicRule> = {
  full_8: { id: 'full_8', label: 'שיטתי 8', kind: 'full', numbersCount: 8, enabled: true },
  full_9: { id: 'full_9', label: 'שיטתי 9', kind: 'full', numbersCount: 9, enabled: true },
  full_10: { id: 'full_10', label: 'שיטתי 10', kind: 'full', numbersCount: 10, enabled: true },
  full_11: { id: 'full_11', label: 'שיטתי 11', kind: 'full', numbersCount: 11, enabled: true },
  full_12: { id: 'full_12', label: 'שיטתי 12', kind: 'full', numbersCount: 12, enabled: true },
  // TODO verify at terminal: the rule of `שיטתי 6=5` is unknown.
  six_equals_five: { id: 'six_equals_five', label: 'שיטתי 6=5', kind: 'unknown', enabled: false },
  // TODO verify at terminal: assumed 6 numbers with n strong numbers = n combinations.
  strong_4: { id: 'strong_4', label: 'שיטתי חזק 4', kind: 'strong', numbersCount: 6, strongCount: 4, enabled: false },
  strong_5: { id: 'strong_5', label: 'שיטתי חזק 5', kind: 'strong', numbersCount: 6, strongCount: 5, enabled: false },
  strong_6: { id: 'strong_6', label: 'שיטתי חזק 6', kind: 'strong', numbersCount: 6, strongCount: 6, enabled: false },
  strong_7: { id: 'strong_7', label: 'שיטתי חזק 7', kind: 'strong', numbersCount: 6, strongCount: 7, enabled: false },
};

export function getSystematicRule(id: string): SystematicRule | undefined {
  return Object.prototype.hasOwnProperty.call(SYSTEMATIC_RULES, id) ? SYSTEMATIC_RULES[id] : undefined;
}
