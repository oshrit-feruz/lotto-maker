import { describe, expect, it } from 'vitest';
import { routerBasename } from './basename';

describe('routerBasename', () => {
  it('drops the trailing slash so /admin (no slash) still matches', () => {
    expect(routerBasename('/admin/')).toBe('/admin');
  });
  it('keeps the root base', () => {
    expect(routerBasename('/')).toBe('/');
  });
});
