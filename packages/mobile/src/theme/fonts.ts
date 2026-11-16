import { fonts } from './tokens.js';

/**
 * Secular One (display) and Rubik (body), SIL OFL 1.1 (licences in
 * assets/fonts). The same Google Fonts files the website self-hosts, converted
 * from woff2 to TTF by scripts/convert-fonts.py: Rubik's variable font is cut
 * into static 400/500/700 faces and each family's Hebrew and Latin subsets are
 * merged into one file, since React Native has no per-glyph font stack.
 */
export const fontAssets = {
  [fonts.display]: require('../../assets/fonts/SecularOne-Regular.ttf'),
  [fonts.body]: require('../../assets/fonts/Rubik-Regular.ttf'),
  [fonts.bodyMedium]: require('../../assets/fonts/Rubik-Medium.ttf'),
  [fonts.bodyBold]: require('../../assets/fonts/Rubik-Bold.ttf'),
};
