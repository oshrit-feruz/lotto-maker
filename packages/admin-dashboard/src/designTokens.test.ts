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

// WCAG 2.x contrast of the sidebar colours (styles.css, `.layout nav`) on the pine-deep sidebar.
describe('admin sidebar contrast (WCAG AA)', () => {
  const styles = readFileSync(join(here, 'styles.css'), 'utf8');
  const navProp = (name: string) => styles.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim() ?? '';
  type Rgb = [number, number, number];
  const hex = (h: string): Rgb => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as Rgb;
  // A translucent white overlay (`rgba(255, 255, 255, a)`) composited over `under`.
  const overlay = (rgba: string, under: Rgb): Rgb => {
    const alpha = Number(/rgba\(255, 255, 255, ([\d.]+)\)/.exec(rgba)?.[1]);
    return under.map((c) => 255 * alpha + c * (1 - alpha)) as Rgb;
  };
  const luminance = (rgb: Rgb) => {
    const [r, g, b] = rgb.map((c) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }) as Rgb;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: Rgb, b: Rgb) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };
  const sidebar = hex(colors.pineDeep);
  const white = hex('#ffffff');

  it('nav text, hover and active state reach 4.5:1', () => {
    expect(contrast(hex(navProp('nav-text')), sidebar)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(white, overlay(navProp('nav-hover-bg'), sidebar))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(hex(colors.sun), overlay(navProp('nav-active-bg'), sidebar))).toBeGreaterThanOrEqual(4.5);
  });

  it('the logout button border reaches 3:1 (non-text)', () => {
    expect(contrast(hex(navProp('nav-control-border')), sidebar)).toBeGreaterThanOrEqual(3);
  });
});
