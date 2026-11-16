// Extends app.json. EXPO_BASE_URL sets the sub-path the web build is served
// from (GitHub Pages serves the repo at /<repo>/); Expo then prefixes the
// bundle, fonts and every other asset with it. Unset for native and local dev.
module.exports = ({ config }) => {
  const baseUrl = process.env.EXPO_BASE_URL;
  if (!baseUrl) return config;
  return { ...config, experiments: { ...config.experiments, baseUrl } };
};
