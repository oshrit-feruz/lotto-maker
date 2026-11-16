/**
 * Design tokens for the customer app: "the courier's ticket", the same visual
 * system as the customer website (packages/web/src/app/globals.css).
 *
 * The lottery ball is the energetic object; the perforated ticket stub is the
 * trust object. Pine, sun-yellow and plum on a cool mint paper, deliberately
 * unrelated to Mifal HaPais's colours.
 *
 * TODO(design-tokens): packages/shared/src/design/tokens.ts is being added to
 * main as the single source for these values. Once it lands, import the
 * palette, radii and type scale from there and delete the duplicates below.
 * Until then every value here must stay identical to the web's globals.css.
 */
import { Platform } from 'react-native';

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

  brandInk: '#ffffff',
  brandSoft: '#d3e0e5',
  danger: '#b3261e',
  dangerSoft: '#fdecea',
  dangerInk: '#8f1d17',
  ok: '#17703f',
  okSoft: '#e2f3e8',
  okInk: '#0f5530',
  warnInk: '#3e2f00',
  warnLine: '#f2d58a',
  errorLine: '#efb7b1',
  okLine: '#b4dcc2',
  infoLine: '#bccdd6',
  neutralSoft: '#e6ebee',
  /** Placeholder text and disabled ghost-button text. */
  faint: '#7d8f98',

  /** Text on pine backgrounds (hero copy, countdown labels). */
  onPineMuted: '#d3e0e5',
  /** Footer / disclaimer panel on pine-deep. */
  disclaimerBg: '#1f3a46',
  disclaimerLine: '#3b5866',
  disclaimerText: '#d5e0e5',

  inputBorder: '#b8c8d0',
  pickerBorder: '#c7d4db',
  strongPickerBorder: '#d3c3e2',
  perforation: '#c3d1d8',
  emptyRing: '#a8bac3',
  disabledBg: '#b9c6cd',
  disabledInk: '#33444c',
  sunHover: '#ffd25e',
} as const;

/** Glossy ball shading: highlight, body, rim (the web's radial-gradient stops). */
export const ballShades = {
  white: { hi: '#ffffff', mid: '#eaf0f3', lo: '#b7c7cf', ink: colors.pineDeep },
  sun: { hi: '#fff6d6', mid: colors.sun, lo: colors.sunDeep, ink: colors.pineDeep },
  plum: { hi: '#d9c2ee', mid: '#7a46a8', lo: colors.plum, ink: '#ffffff' },
} as const;

export type BallTone = keyof typeof ballShades;

export const radii = {
  /** --radius */
  md: 14,
  /** --radius-sm */
  sm: 10,
  /** The hero panel. */
  lg: 24,
  pill: 999,
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

/** Minimum touch target, in points. */
export const touch = 44;

/** Font files are registered under these names in App.tsx (see assets/fonts). */
export const fonts = {
  display: 'SecularOne-Regular',
  body: 'Rubik-Regular',
  bodyMedium: 'Rubik-Medium',
  bodyBold: 'Rubik-Bold',
} as const;

/**
 * Type scale: 1.25 ratio from a 16px body, as on the web (h1 1.95rem, h2
 * 1.5rem, h3 1.2rem). Secular One has a single weight, so display styles never
 * set fontWeight; Rubik weights are separate static files.
 */
export const type = {
  h1: { fontFamily: fonts.display, fontSize: 31, lineHeight: 37, color: colors.ink },
  h2: { fontFamily: fonts.display, fontSize: 24, lineHeight: 29, color: colors.ink },
  h3: { fontFamily: fonts.display, fontSize: 19, lineHeight: 23, color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 25, color: colors.ink },
  bodyStrong: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 25, color: colors.ink },
  label: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 22, color: colors.ink },
  small: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.muted },
  smallStrong: { fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 21, color: colors.ink },
  caption: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: colors.muted },
  button: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 20 },
} as const;

/** --shadow: a hairline plus a soft pine drop. */
export const shadows = {
  card: Platform.select({
    web: { boxShadow: '0 1px 0 rgba(57, 92, 107, 0.06), 0 10px 24px -14px rgba(57, 92, 107, 0.35)' } as object,
    default: {
      shadowColor: colors.pine,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.16,
      shadowRadius: 12,
      elevation: 3,
    },
  }),
  /** The draw stub lifted off the pine hero. */
  raised: Platform.select({
    web: { boxShadow: '0 24px 40px -24px rgba(0, 0, 0, 0.6)' } as object,
    default: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.3,
      shadowRadius: 18,
      elevation: 8,
    },
  }),
  /** Sticky bars that sit above content (tab bar, price bar). */
  bar: Platform.select({
    web: { boxShadow: '0 -10px 30px -12px rgba(57, 92, 107, 0.35)' } as object,
    default: {
      shadowColor: colors.pine,
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 10,
    },
  }),
} as const;
