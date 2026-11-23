/** The env settings HypPaymentProvider needs. Kept apart from config.ts so both can import it. */
export interface HypEnv {
  HYP_GATEWAY_URL?: string;
  HYP_TERMINAL_NUMBER?: string;
  HYP_USER?: string;
  HYP_PASSWORD?: string;
  HYP_MID?: string;
}

const REQUIRED = ['HYP_GATEWAY_URL', 'HYP_TERMINAL_NUMBER', 'HYP_USER', 'HYP_PASSWORD', 'HYP_MID'] as const;

/** Names of the required HYP_* settings that are unset (never their values). */
export function missingHypSettings(env: HypEnv): string[] {
  return REQUIRED.filter((name) => !env[name]);
}
