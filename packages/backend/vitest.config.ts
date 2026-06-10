import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/modules/*/validators*', 'src/modules/orders/orders.validator*'],
    },
  },
  resolve: {
    alias: {
      '@lotto-maker/shared': new URL('../shared/src/index.ts', import.meta.url).pathname,
    },
  },
});
