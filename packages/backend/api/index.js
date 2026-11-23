// Vercel Function: every request is rewritten here (vercel.json) and handled by the Fastify app.
// The code is the compiled backend (dist/, built by scripts/vercel-build.sh); see src/vercel.ts.
export { default } from '../dist/vercel.js';
