// Extends app.json. EXPO_BASE_URL sets the sub-path the web build is served
// from (GitHub Pages serves the repo at /<repo>/); Expo then prefixes the
// bundle, fonts and every other asset with it. Unset for native and local dev.
// The app name in app.json is BRAND_NAME from packages/shared (constants/brand.ts);
// src/brand.test.ts keeps the two in step.
module.exports = function appConfig({ config }) {
  const baseUrl = process.env.EXPO_BASE_URL;
  if (!baseUrl) return config;
  return { ...config, experiments: { ...config.experiments, baseUrl } };
};
