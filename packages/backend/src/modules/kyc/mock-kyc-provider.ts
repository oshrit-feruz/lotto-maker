import { differenceInYears, isValid, parseISO } from 'date-fns';
import { nanoid } from 'nanoid';
import { isValidIsraeliId } from '../../lib/crypto.js';
import type { KycProvider, KycVerifyInput, KycVerifyResult } from './kyc-provider.js';

export interface MockKycOptions {
  /** Test switch: every otherwise-valid check goes to manual review. */
  forceManualReview?: boolean;
}

/**
 * Dev/test provider: verifies a valid Israeli ID check digit and age >= 18, rejects otherwise.
 * It checks nothing against a real registry, so it is refused in production.
 */
export class MockKycProvider implements KycProvider {
  readonly name = 'mock';

  constructor(private readonly options: MockKycOptions = {}) {}

  async verify(input: KycVerifyInput): Promise<KycVerifyResult> {
    const reference = `mock_kyc_${nanoid(12)}`;

    if (!isValidIsraeliId(input.idNumber)) {
      return { status: 'rejected', reference, reason: 'INVALID_ID_CHECK_DIGIT' };
    }
    const birth = parseISO(input.birthDate);
    if (!isValid(birth) || birth > new Date()) {
      return { status: 'rejected', reference, reason: 'INVALID_BIRTH_DATE' };
    }
    if (differenceInYears(new Date(), birth) < 18) {
      return { status: 'rejected', reference, reason: 'UNDERAGE' };
    }
    if (this.options.forceManualReview) {
      return { status: 'manual_review', reference, reason: 'FORCED_MANUAL_REVIEW' };
    }
    return { status: 'verified', reference };
  }
}
