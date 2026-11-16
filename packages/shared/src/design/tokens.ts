/**
 * Design tokens shared by every product: the customer website, the admin dashboard,
 * the operator dashboard and the mobile app.
 *
 * Source of truth: the customer website's design ("the courier's ticket", packages/web
 * globals.css). The lottery ball is the energetic object, the perforated ticket stub the
 * trust object. Pine, sun-yellow and plum on a cool mint paper, deliberately unrelated to
 * Mifal HaPais's colours.
 *
 * `tokens.css` next to this file holds the same values as CSS custom properties. Keep the
 * two in step: the admin dashboard has a test that compares them.
 */

export const colors = {
  pine: '#395c6b',
  pineDeep: '#284450',
  pine2: '#4a7182',
  sun: '#ffc233',
  sunDeep: '#e8a500',
  sunSoft: '#fff4d4',
  plum: '#5b2a86',
  plumSoft: '#efe6f7',
  paper: '#eef3f5',
  ink: '#12232b',
  muted: '#5a6f78',
  line: '#d6e0e6',
  surface: '#ffffff',
  /** Soft pine tint: info alerts, neutral badges, ghost-button hover. */
  pineSoft: '#d3e0e5',
  ok: '#17703f',
  okSoft: '#e2f3e8',
  danger: '#b3261e',
  dangerSoft: '#fdecea',
} as const;

export const radii = {
  /** Cards, dialogs, the ticket stub. */
  md: 14,
  /** Inputs, alerts, small panels. */
  sm: 10,
  /** Buttons, badges, nav pills. */
  pill: 999,
} as const;

export const shadows = {
  /** The one card shadow: a hairline plus a soft pine drop. */
  card: '0 1px 0 rgba(57, 92, 107, 0.06), 0 10px 24px -14px rgba(57, 92, 107, 0.35)',
  /** Keyboard focus: a paper gap, then a plum ring. */
  focus: `0 0 0 3px ${colors.paper}, 0 0 0 6px ${colors.plum}`,
} as const;

/**
 * Typefaces, both Google Fonts under the SIL OFL 1.1, self-hosted as woff2 by each app.
 * Secular One for display (headings, big numbers, ball numbers), Rubik for body text.
 * Secular One draws ₪ as two letters, so display text takes that one sign from Rubik.
 */
export const fonts = {
  display: 'Secular One',
  body: 'Rubik',
  /** Rubik limited to U+20AA (₪), placed first in the display stack. */
  shekel: 'Rubik Shekel',
  displayStack: "'Rubik Shekel', 'Secular One', 'Rubik', system-ui, sans-serif",
  bodyStack: "'Rubik', system-ui, -apple-system, 'Segoe UI', Arial, sans-serif",
} as const;

/** The lottery-ball gradients: regular numbers are sun, the strong number is plum. */
export const balls = {
  regular: { hi: '#fff6d6', mid: colors.sun, lo: colors.sunDeep, text: colors.pineDeep },
  strong: { hi: '#d9c2ee', mid: '#7a46a8', lo: colors.plum, text: '#ffffff' },
} as const;

export const designTokens = { colors, radii, shadows, fonts, balls } as const;
export type DesignTokens = typeof designTokens;
