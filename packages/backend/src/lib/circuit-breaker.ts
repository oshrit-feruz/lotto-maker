export interface CapacitySnapshot {
  activeOperators: number;
  throughputPerHour: number;
  minutesUntilHardCutoff: number;
  ordersInQueue: number;
}

export type CircuitBreakerRejectionReason = 'CUTOFF_PASSED' | 'NO_OPERATORS' | 'QUEUE_FULL';

export type CircuitBreakerResult =
  | { accepted: true; availableCapacity: number }
  | { accepted: false; availableCapacity: number; reason: CircuitBreakerRejectionReason };

const BUFFER_THRESHOLD_PCT = 0.1;

export function evaluateCircuitBreaker(snap: CapacitySnapshot): CircuitBreakerResult {
  if (snap.minutesUntilHardCutoff <= 0) {
    return { accepted: false, availableCapacity: 0, reason: 'CUTOFF_PASSED' };
  }
  if (snap.activeOperators === 0) {
    return { accepted: false, availableCapacity: 0, reason: 'NO_OPERATORS' };
  }

  const grossCapacity = Math.floor(snap.throughputPerHour * (snap.minutesUntilHardCutoff / 60));
  const availableCapacity = grossCapacity - snap.ordersInQueue;
  const buffer = Math.ceil(grossCapacity * BUFFER_THRESHOLD_PCT);

  if (availableCapacity <= buffer) {
    return { accepted: false, availableCapacity, reason: 'QUEUE_FULL' };
  }

  return { accepted: true, availableCapacity };
}
