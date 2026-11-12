import localFont from 'next/font/local';

// Google Fonts (SIL OFL 1.1, licences in src/fonts/), self-hosted so the build
// never needs network access. Each subset is its own family; the CSS stacks
// list Hebrew first and Latin second, so Hebrew letters and Latin digits each
// come from the right file. Same files Google Fonts serves (via @fontsource).

export const secularHe = localFont({
  src: '../fonts/secular-one-hebrew-400-normal.woff2',
  weight: '400',
  display: 'swap',
  variable: '--font-secular-he',
  fallback: ['system-ui', 'sans-serif'],
});

export const secularLatin = localFont({
  src: '../fonts/secular-one-latin-400-normal.woff2',
  weight: '400',
  display: 'swap',
  variable: '--font-secular-latin',
  fallback: ['system-ui', 'sans-serif'],
});

export const rubikHe = localFont({
  src: '../fonts/rubik-hebrew-wght-normal.woff2',
  weight: '300 900',
  display: 'swap',
  variable: '--font-rubik-he',
  fallback: ['system-ui', 'sans-serif'],
});

export const rubikLatin = localFont({
  src: '../fonts/rubik-latin-wght-normal.woff2',
  weight: '300 900',
  display: 'swap',
  variable: '--font-rubik-latin',
  fallback: ['system-ui', 'sans-serif'],
});

// Secular One draws ₪ as two letters; display text takes just that sign from Rubik.
export const shekelSign = localFont({
  src: '../fonts/rubik-hebrew-wght-normal.woff2',
  weight: '300 900',
  display: 'swap',
  variable: '--font-shekel',
  preload: false,
  // No generated fallback face: it would cover every glyph, not just ₪.
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+20AA' }],
});

export const fontVariables = [secularHe, secularLatin, rubikHe, rubikLatin, shekelSign].map((f) => f.variable).join(' ');
