// @vitest-environment node
// Reads the shared tokens files, so it runs in Node rather than jsdom.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { colors, fonts, radii, shadows } from '../../shared/src/design/tokens';

// The shared design tokens exist twice: as TS constants and as CSS custom properties
// (which this app's styles.css imports). They must not drift apart.

const here = fileURLToPath(new URL('./', import.meta.url));
const css = readFileSync(join(here, '../../shared/src/design/tokens.css'), 'utf8');
const prop = (name: string) => css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim();
const kebab = (s: string) => s.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase();

describe('shared design tokens', () => {
  it.each(Object.entries(colors))('colour %s matches tokens.css', (name, value) => {
    expect(prop(kebab(name))).toBe(value);
  });

  it('radii, shadow and font stacks match tokens.css', () => {
    expect(prop('radius')).toBe(`${radii.md}px`);
    expect(prop('radius-sm')).toBe(`${radii.sm}px`);
    expect(prop('radius-pill')).toBe(`${radii.pill}px`);
    expect(prop('shadow')).toBe(shadows.card);
    expect(prop('font-display')).toBe(fonts.displayStack);
    expect(prop('font-body')).toBe(fonts.bodyStack);
  });

  it('this app declares the font families the stacks name', () => {
    const fontsCss = readFileSync(join(here, 'fonts.css'), 'utf8');
    for (const family of [fonts.display, fonts.body, fonts.shekel]) {
      expect(fontsCss).toContain(`font-family: '${family}';`);
    }
  });
});
