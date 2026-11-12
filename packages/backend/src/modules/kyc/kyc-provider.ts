export type KycVerdict = 'verified' | 'rejected' | 'manual_review';

export interface KycVerifyInput {
  /** Canonical 9-digit Israeli ID. */
  idNumber: string;
  fullName: string;
  /** YYYY-MM-DD. */
  birthDate: string;
}

export interface KycVerifyResult {
  status: KycVerdict;
  /** The provider's reference for this check. Stored on KycCheck. */
  reference: string;
  /** Why it was rejected or sent to review. */
  reason?: string;
}

/**
 * An identity-verification provider. Only MockKycProvider exists today; a real one
 * (population-registry lookup / eKYC vendor) implements this same interface.
 */
export interface KycProvider {
  readonly name: string;
  verify(input: KycVerifyInput): Promise<KycVerifyResult>;
}
