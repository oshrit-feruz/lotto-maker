/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The monorepo root has React 18.2 (from mobile). Tests must use this package's own copy,
// or Testing Library renders with a second React and hooks break.
const local = (p: string) => fileURLToPath(new URL(`./node_modules/${p}`, import.meta.url));

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  server: { port: 5174 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: false,
    alias: [
      // Testing Library's CommonJS build would `require` the root react-dom; use its ESM build so the aliases apply.
      { find: /^@testing-library\/react$/, replacement: '@testing-library/react/dist/@testing-library/react.esm.js' },
      // React Router's `main` is CommonJS too; its ESM build (`module`) lets the react alias apply.
      { find: /^react-router-dom$/, replacement: 'react-router-dom/dist/index.js' },
      { find: /^react-router$/, replacement: 'react-router/dist/index.js' },
      { find: /^react-dom(\/.*)?$/, replacement: local('react-dom') + '$1' },
      { find: /^react(\/.*)?$/, replacement: local('react') + '$1' },
    ],
    // React Query and React Router are hoisted to the root too; inline them so their `react` import gets the alias.
    server: { deps: { inline: [/@testing-library\//, /@tanstack\/react-query/, /react-router/] } },
  },
});
