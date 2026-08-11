import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetrySync } from '../src/utils/index';

describe('withRetrySync', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should execute successfully on the first attempt without retrying or logging warnings', () => {
    const fn = vi.fn().mockReturnValue('success-value');

    const result = withRetrySync(fn);

    expect(result).toBe('success-value');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('should succeed after transient failures and log warnings for failed attempts', () => {
    let attempts = 0;
    const fn = vi.fn().mockImplementation(() => {
      attempts++;
      if (attempts < 3) {
        throw new Error(`Failure ${attempts}`);
      }
      return 'success-after-failures';
    });

    const result = withRetrySync(fn, { maxRetries: 3 });

    expect(result).toBe('success-after-failures');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenNthCalledWith(
      1,
      '[retry-sync] Attempt 1/4 failed: Failure 1.',
    );
    expect(console.warn).toHaveBeenNthCalledWith(
      2,
      '[retry-sync] Attempt 2/4 failed: Failure 2.',
    );
  });

  it('should throw the last error when all retries are exhausted', () => {
    const fn = vi.fn().mockImplementation(() => {
      throw new Error('Persistent failure');
    });

    expect(() => withRetrySync(fn, { maxRetries: 2 })).toThrowError(
      'Persistent failure',
    );
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial attempt + 2 retries
    expect(console.warn).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenNthCalledWith(
      1,
      '[retry-sync] Attempt 1/3 failed: Persistent failure.',
    );
    expect(console.warn).toHaveBeenNthCalledWith(
      2,
      '[retry-sync] Attempt 2/3 failed: Persistent failure.',
    );
  });

  it('should respect custom maxRetries options', () => {
    const fn = vi.fn().mockImplementation(() => {
      throw new Error('Fail');
    });

    expect(() => withRetrySync(fn, { maxRetries: 5 })).toThrowError('Fail');
    expect(fn).toHaveBeenCalledTimes(6); // 1 initial attempt + 5 retries
    expect(console.warn).toHaveBeenCalledTimes(5);
  });

  it('should wrap non-Error thrown values into Error objects', () => {
    let attempts = 0;
    const fn = vi.fn().mockImplementation(() => {
      attempts++;
      if (attempts === 1) {
        throw 'String error';
      }
      return 'success';
    });

    const result = withRetrySync(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(
      '[retry-sync] Attempt 1/4 failed: String error.',
    );
  });
});
