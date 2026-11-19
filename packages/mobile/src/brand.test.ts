import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND_NAME } from '../../shared/src/constants/brand.js';

// app.json is plain JSON and cannot import the shared constant, so this keeps it in step.
describe('brand name', () => {
  it('app.json shows the shared BRAND_NAME', () => {
    const app = JSON.parse(readFileSync(join(__dirname, '../app.json'), 'utf8')) as { expo: { name: string } };
    expect(app.expo.name).toBe(BRAND_NAME);
  });
});
