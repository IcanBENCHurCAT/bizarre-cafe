import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isNonceValid } from '../src/utils/index.js';

describe('isNonceValid', () => {
  beforeEach(() => {
    // Tell Vitest to use fake timers
    vi.useFakeTimers();
    // Set system time to a fixed timestamp (e.g., 2024-01-01 12:00:00 UTC)
    const mockNow = new Date('2024-01-01T12:00:00Z').getTime();
    vi.setSystemTime(mockNow);
  });

  afterEach(() => {
    // Restore real timers after each test
    vi.useRealTimers();
  });

  it('should return true for a timestamp that is exactly current time', () => {
    const now = Date.now();
    expect(isNonceValid(now)).toBe(true);
  });

  it('should return true for a timestamp within the default 5-minute window', () => {
    // 5 minutes = 300,000 ms. Let's test 2 minutes in the past.
    const twoMinutesPast = Date.now() - 120_000;
    expect(isNonceValid(twoMinutesPast)).toBe(true);
  });

  it('should return true for a timestamp exactly at the limit of the default window', () => {
    const limit = Date.now() - 300_000;
    expect(isNonceValid(limit)).toBe(true);
  });

  it('should return false for a timestamp older than the default window', () => {
    const tooOld = Date.now() - 300_001;
    expect(isNonceValid(tooOld)).toBe(false);
  });

  it('should return false for a timestamp far older than the default window', () => {
    const ancient = Date.now() - 1_000_000;
    expect(isNonceValid(ancient)).toBe(false);
  });

  it('should return true for a future timestamp', () => {
    // Since Date.now() - timestamp will be negative, and negative numbers are <= windowMs,
    // the current implementation returns true for future timestamps.
    const future = Date.now() + 5000;
    expect(isNonceValid(future)).toBe(true);
  });

  it('should support custom window sizes and validate correctly within them', () => {
    // Test with a 10-second (10,000 ms) window
    const customWindow = 10_000;
    const pastFiveSeconds = Date.now() - 5000;
    const pastElevenSeconds = Date.now() - 11_000;

    expect(isNonceValid(pastFiveSeconds, customWindow)).toBe(true);
    expect(isNonceValid(pastElevenSeconds, customWindow)).toBe(false);
  });
});
