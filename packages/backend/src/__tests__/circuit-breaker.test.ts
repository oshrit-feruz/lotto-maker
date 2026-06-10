import { describe, it, expect } from 'vitest';
import { evaluateCircuitBreaker } from '../lib/circuit-breaker.js';

describe('evaluateCircuitBreaker', () => {
  it('rejects when cutoff has passed', () => {
    const result = evaluateCircuitBreaker({
      activeOperators: 3,
      throughputPerHour: 150,
      minutesUntilHardCutoff: 0,
      ordersInQueue: 0,
    });
    expect(result.accepted).toBe(false);
    expect(!result.accepted && result.reason).toBe('CUTOFF_PASSED');
  });

  it('rejects when no operators are active', () => {
    const result = evaluateCircuitBreaker({
      activeOperators: 0,
      throughputPerHour: 0,
      minutesUntilHardCutoff: 30,
      ordersInQueue: 0,
    });
    expect(result.accepted).toBe(false);
    expect(!result.accepted && result.reason).toBe('NO_OPERATORS');
  });

  it('rejects when queue is over threshold', () => {
    // 2 operators × 50/hr × 30min = 50 gross capacity; buffer = 5
    // ordersInQueue = 46 → available = 4 ≤ buffer → reject
    const result = evaluateCircuitBreaker({
      activeOperators: 2,
      throughputPerHour: 100,
      minutesUntilHardCutoff: 30,
      ordersInQueue: 46,
    });
    expect(result.accepted).toBe(false);
    expect(!result.accepted && result.reason).toBe('QUEUE_FULL');
  });

  it('accepts when capacity is available', () => {
    // 50 gross, 5 buffer, 10 in queue → available = 40 > 5
    const result = evaluateCircuitBreaker({
      activeOperators: 2,
      throughputPerHour: 100,
      minutesUntilHardCutoff: 30,
      ordersInQueue: 10,
    });
    expect(result.accepted).toBe(true);
    expect(result.accepted && result.availableCapacity).toBe(40);
  });

  it('correctly applies the 10% buffer threshold', () => {
    // 60 gross capacity, buffer = 6, exactly 54 in queue → available = 6 ≤ buffer → reject
    const atBoundary = evaluateCircuitBreaker({
      activeOperators: 1,
      throughputPerHour: 60,
      minutesUntilHardCutoff: 60,
      ordersInQueue: 54,
    });
    expect(atBoundary.accepted).toBe(false);

    // 53 in queue → available = 7 > buffer → accept
    const justOver = evaluateCircuitBreaker({
      activeOperators: 1,
      throughputPerHour: 60,
      minutesUntilHardCutoff: 60,
      ordersInQueue: 53,
    });
    expect(justOver.accepted).toBe(true);
  });
});
