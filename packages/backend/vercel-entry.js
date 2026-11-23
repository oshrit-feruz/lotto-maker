// Vercel Function: the backend service's entrypoint (root vercel.json). Every request to the service is handled here by the Fastify app.
// The code is the compiled backend (dist/, built by scripts/vercel-build.sh); see src/vercel.ts.
export { default } from './dist/vercel.js';
