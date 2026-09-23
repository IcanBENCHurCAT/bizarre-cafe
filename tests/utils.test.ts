import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateId, withRetry, withRetrySync, generateNonce, validateReceipt, parseX402Header, formatMessageList, FormattedMessage, truncate } from '../src/utils/index.js';

// ============================================================
// generateId tests (from PR #13)
// ============================================================
describe('generateId', () => {
  let originalRandomUUID: typeof crypto.randomUUID | undefined;

  beforeEach(() => {
    originalRandomUUID = crypto.randomUUID;
  });

  afterEach(() => {
    if (originalRandomUUID) {
      crypto.randomUUID = originalRandomUUID;
    } else {
      // @ts-expect-error - delete is allowed on global crypto
      delete crypto.randomUUID;
    }
    vi.restoreAllMocks();
  });

  describe('with crypto.randomUUID available (standard path)', () => {
    it('should generate a valid ID without a prefix', () => {
      const id = generateId();
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
      expect(id.length).toBe(36);
    });

    it('should generate a valid ID with a prefix', () => {
      const prefix = 'test';
      const id = generateId(prefix);
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.startsWith(`${prefix}_`)).toBe(true);
      expect(id.length).toBe(prefix.length + 1 + 36);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      const count = 1000;
      for (let i = 0; i < count; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(count);
    });
  });

  describe('without crypto.randomUUID available (fallback path)', () => {
    beforeEach(() => {
      Object.defineProperty(crypto, 'randomUUID', {
        value: undefined,
        configurable: true,
        writable: true,
      });
    });

    it('should fallback and generate a valid ID without a prefix using getRandomValues', () => {
      const getRandomValuesSpy = vi.spyOn(crypto, 'getRandomValues');
      const id = generateId();
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
      expect(id).toContain('-');
      expect(getRandomValuesSpy).toHaveBeenCalled();
    });

    it('should fallback and generate a valid ID with a prefix using getRandomValues', () => {
      const getRandomValuesSpy = vi.spyOn(crypto, 'getRandomValues');
      const prefix = 'fallback_test';
      const id = generateId(prefix);
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.startsWith(`${prefix}_`)).toBe(true);
      expect(id).toContain('-');
      expect(getRandomValuesSpy).toHaveBeenCalled();
    });

    it('should generate unique fallback IDs', () => {
      const ids = new Set<string>();
      const count = 1000;
      for (let i = 0; i < count; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(count);
    });
  });
});

// ============================================================
// truncate tests
// ============================================================
describe('truncate', () => {
  it('should return empty string for empty string or falsy inputs', () => {
    expect(truncate('')).toBe('');
    // @ts-expect-error - testing invalid JS inputs
    expect(truncate(null)).toBe(null);
    // @ts-expect-error - testing invalid JS inputs
    expect(truncate(undefined)).toBe(undefined);
  });

  it('should return the original string if its length is less than maxLength', () => {
    const input = 'Hello World';
    expect(truncate(input, 20)).toBe(input);
  });

  it('should return the original string if its length is exactly equal to maxLength', () => {
    const input = 'Hello World';
    expect(truncate(input, input.length)).toBe(input);
  });

  it('should truncate and append ... if string length exceeds maxLength', () => {
    const input = 'Hello World';
    expect(truncate(input, 5)).toBe('Hello...');
  });

  it('should use default maxLength of 100 when maxLength parameter is omitted', () => {
    const shortString = 'A'.repeat(50);
    expect(truncate(shortString)).toBe(shortString);

    const longString = 'A'.repeat(105);
    const result = truncate(longString);
    expect(result).toBe('A'.repeat(100) + '...');
    expect(result.length).toBe(103);
  });

  it('should handle small maxLength values (e.g., 0 or 1)', () => {
    expect(truncate('Hello', 0)).toBe('...');
    expect(truncate('Hello', 1)).toBe('H...');
  });

  it('should handle negative maxLength values', () => {
    expect(truncate('Hello', -5)).toBe('...');
  });
});

// ============================================================
// withRetry tests
// ============================================================
describe('withRetry', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should execute successfully on the first attempt without retrying or logging warnings', async () => {
    const fn = vi.fn().mockResolvedValue('success-value');
    const result = await withRetry(fn);
    expect(result).toBe('success-value');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('should retry on failure and succeed if a subsequent attempt succeeds', async () => {
    let attempts = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error(`Transient error ${attempts}`);
      }
      return 'recovered-value';
    });

    const retryPromise = withRetry(fn, { maxRetries: 3, baseDelay: 100 });
    await vi.runAllTimersAsync();
    const result = await retryPromise;

    expect(result).toBe('recovered-value');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(console.warn).toHaveBeenCalledTimes(2);
    // Assert on error text rather than full log format to reduce coupling
    expect(console.warn).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('Transient error 1'),
    );
    expect(console.warn).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('Transient error 2'),
    );
  });

  it('should propagate the error when all retry attempts are exhausted', async () => {
    const fn = vi.fn().mockImplementation(async () => {
      throw new Error('Persistent async error');
    });

    const retryPromise = withRetry(fn, { maxRetries: 2, baseDelay: 100 });
    retryPromise.catch(() => {});

    await vi.runAllTimersAsync();

    await expect(retryPromise).rejects.toThrow('Persistent async error');

    expect(fn).toHaveBeenCalledTimes(3);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it('should handle custom retry options like maxRetries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Custom max retries error'));

    const retryPromise = withRetry(fn, { maxRetries: 5, baseDelay: 10 });
    retryPromise.catch(() => {});

    await vi.runAllTimersAsync();

    await expect(retryPromise).rejects.toThrow('Custom max retries error');

    expect(fn).toHaveBeenCalledTimes(6);
    expect(console.warn).toHaveBeenCalledTimes(5);
  });

  it('should wrap non-Error thrown values into Error instances', async () => {
    let attempts = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts === 1) {
        throw 'Raw string error';
      }
      return 'success';
    });

    const retryPromise = withRetry(fn, { baseDelay: 10 });
    await vi.runAllTimersAsync();
    const result = await retryPromise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
    // Assert on error text to reduce coupling with log format
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Raw string error'),
    );
  });

  // --- Review improvement 1: exhaustion case for non-Error values ---
  it('should exhaust all retries when a non-Error is thrown each time and propagate as Error instance', async () => {
    const fn = vi.fn().mockReturnValue('always string');

    const retryPromise = withRetry(fn, {
      maxRetries: 2,
      baseDelay: 10,
    });
    retryPromise.catch(() => {});

    await vi.runAllTimersAsync();

    await expect(retryPromise).rejects.toBeInstanceOf(Error);
    await expect(retryPromise).rejects.toBeInstanceOf(Error);

    // The last caught value should be an Error wrapping the original string
    try {
      await retryPromise;
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      // The wrapped value should be the original 'always string'
      expect(e.message).toContain('always string');
    }

    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  // --- Review improvement 2: verify exponential backoff delay grows ---
  it('should use exponential backoff: delays should double between attempts', async () => {
    let attempts = 0;
    const callTimestamps: number[] = [];
    const originalSetTimeout = global.setTimeout;
    const fakeTimerSpies: ReturnType<typeof vi.spyOn>[] = [];

    const fn = vi.fn().mockImplementation(async () => {
      attempts++;
      callTimestamps.push(Date.now());
      if (attempts < 4) {
        throw new Error(`Transient ${attempts}`);
      }
      return 'recovered';
    });

    vi.spyOn(global, 'setTimeout').mockImplementation((cb, ms) => {
      fakeTimerSpies.push(vi.advanceTimersByTime(ms as number));
      return originalSetTimeout(cb, ms as number) as ReturnType<typeof setTimeout>;
    });

    const retryPromise = withRetry(fn, { maxRetries: 3, baseDelay: 10 });
    await vi.runAllTimersAsync();
    const result = await retryPromise;

    expect(result).toBe('recovered');
    expect(attempts).toBe(4);
    // Verify that the mock was called with increasing delay values
    // setTimeout should have been called with 10, 20, 40 (exponential growth)
    const setTimeoutCalls = vi.getMockedSetTimeoutCalls();
    expect(setTimeoutCalls.length).toBe(3);
    expect(setTimeoutCalls[0]).toBe(10);
    expect(setTimeoutCalls[1]).toBe(20);
    expect(setTimeoutCalls[2]).toBe(40);
  });
});

// ============================================================
// formatMessageList tests
// ============================================================
describe('formatMessageList', () => {
  it('should return an empty string when given an empty message array', () => {
    expect(formatMessageList([])).toBe('');
  });

  it('should format standard user messages with timestamp prefix', () => {
    const messages: FormattedMessage[] = [
      {
        sender: 'AgentAlpha',
        content: 'Hello world',
        timestamp: '10:00:00 AM',
        isoTime: '2025-01-01T10:00:00.000Z',
        isSystem: false,
      },
      {
        sender: 'AgentBeta',
        content: 'Hi Alpha',
        timestamp: '10:01:00 AM',
        isoTime: '2025-01-01T10:01:00.000Z',
        isSystem: false,
      },
    ];

    const result = formatMessageList(messages);
    expect(result).toBe(
      '[10:00:00 AM] AgentAlpha: Hello world\n[10:01:00 AM] AgentBeta: Hi Alpha',
    );
  });

  it('should format system messages with [SYSTEM] prefix', () => {
    const messages: FormattedMessage[] = [
      {
        sender: 'System',
        content: 'AgentAlpha joined the room',
        timestamp: '10:00:00 AM',
        isoTime: '2025-01-01T10:00:00.000Z',
        isSystem: true,
      },
    ];

    const result = formatMessageList(messages);
    expect(result).toBe('[SYSTEM] System: AgentAlpha joined the room');
  });

  it('should format messages with room ID prefix', () => {
    const messages: FormattedMessage[] = [
      {
        sender: 'AgentAlpha',
        content: 'Room message',
        timestamp: '10:00:00 AM',
        isoTime: '2025-01-01T10:00:00.000Z',
        roomId: 'room-123',
        isSystem: false,
      },
    ];

    const result = formatMessageList(messages);
    expect(result).toBe('[10:00:00 AM] [room-123] AgentAlpha: Room message');
  });

  it('should format system messages with room ID', () => {
    const messages: FormattedMessage[] = [
      {
        sender: 'System',
        content: 'Room closed',
        timestamp: '10:00:00 AM',
        isoTime: '2025-01-01T10:00:00.000Z',
        roomId: 'room-456',
        isSystem: true,
      },
    ];

    const result = formatMessageList(messages);
    expect(result).toBe('[SYSTEM] [room-456] System: Room closed');
  });

  it('should join messages using a custom separator when provided', () => {
    const messages: FormattedMessage[] = [
      {
        sender: 'Agent1',
        content: 'First',
        timestamp: '12:00:00 PM',
        isoTime: '2025-01-01T12:00:00.000Z',
        isSystem: false,
      },
      {
        sender: 'Agent2',
        content: 'Second',
        timestamp: '12:01:00 PM',
        isoTime: '2025-01-01T12:01:00.000Z',
        isSystem: false,
      },
    ];

    const customResult = formatMessageList(messages, ' | ');
    expect(customResult).toBe(
      '[12:00:00 PM] Agent1: First | [12:01:00 PM] Agent2: Second',
    );
  });
});

// ============================================================
// withRetrySync tests (from PR #14)
// ============================================================
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
    // Assert on error text to reduce coupling with log format
    expect(console.warn).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('Failure 1'),
    );
    expect(console.warn).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('Failure 2'),
    );
  });

  it('should throw the last error when all retries are exhausted', () => {
    const fn = vi.fn().mockImplementation(() => {
      throw new Error('Persistent failure');
    });

    expect(() => withRetrySync(fn, { maxRetries: 2 })).toThrowError(
      'Persistent failure',
    );
    expect(fn).toHaveBeenCalledTimes(3);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it('should respect custom maxRetries options', () => {
    const fn = vi.fn().mockImplementation(() => {
      throw new Error('Fail');
    });

    expect(() => withRetrySync(fn, { maxRetries: 5 })).toThrowError('Fail');
    expect(fn).toHaveBeenCalledTimes(6);
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
      expect.stringContaining('String error'),
    );
  });
});

// ============================================================
// generateNonce tests (from PR #15)
// ============================================================
describe('generateNonce', () => {
  it('should generate a nonce with default length of 32 bytes (64 hex characters)', () => {
    const nonce = generateNonce();
    expect(nonce).toBeTypeOf('string');
    expect(nonce.length).toBe(64);
  });

  it('should generate a nonce with custom length', () => {
    const length = 16;
    const nonce = generateNonce(length);
    expect(nonce.length).toBe(32);
  });

  it('should handle zero length correctly', () => {
    const nonce = generateNonce(0);
    expect(nonce).toBe('');
  });

  it('should generate only valid hexadecimal characters', () => {
    const nonce = generateNonce(32);
    expect(nonce).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should produce distinct random nonces on consecutive calls', () => {
    const nonce1 = generateNonce(32);
    const nonce2 = generateNonce(32);
    expect(nonce1).not.toBe(nonce2);
  });
});

// ============================================================
// validateReceipt tests (from PR #18)
// ============================================================
describe('validateReceipt', () => {
  it('should return false for null, undefined, or empty/non-string values', () => {
    // @ts-expect-error - testing invalid JS inputs
    expect(validateReceipt(null)).toBe(false);
    // @ts-expect-error - testing invalid JS inputs
    expect(validateReceipt(undefined)).toBe(false);
    // @ts-expect-error - testing invalid JS inputs
    expect(validateReceipt(1234567890)).toBe(false);
    expect(validateReceipt('')).toBe(false);
  });

  it('should return false for strings shorter than 10 characters', () => {
    expect(validateReceipt('pay_')).toBe(false);
    expect(validateReceipt('0xabc')).toBe(false);
    expect(validateReceipt('abc_123')).toBe(false);
  });

  it('should return true for valid receipts with pay_ prefix', () => {
    expect(validateReceipt('pay_1234567890')).toBe(true);
    expect(validateReceipt('some_pay_123')).toBe(true);
  });

  it('should return true for valid receipts with payment_ prefix', () => {
    expect(validateReceipt('payment_1234567')).toBe(true);
    expect(validateReceipt('custom_payment_abc')).toBe(true);
  });

  it('should return true for valid receipts starting with 0x', () => {
    expect(validateReceipt('0x1234567890')).toBe(true);
    expect(validateReceipt('0xabcdef1234')).toBe(true);
  });

  it('should return true for valid receipts containing underscore', () => {
    expect(validateReceipt('receipt_id_123')).toBe(true);
    expect(validateReceipt('test_string')).toBe(true);
  });

  it('should return false for receipts of length >= 10 that do not match the conditions', () => {
    expect(validateReceipt('abcdefghij')).toBe(false);
    expect(validateReceipt('1234567890')).toBe(false);
    expect(validateReceipt('noprefixatall')).toBe(false);
  });
});

// ============================================================
// parseX402Header tests
// ============================================================
describe('parseX402Header', () => {
  it('should return undefined for invalid input types or empty strings', () => {
    // @ts-expect-error - testing invalid JS inputs
    expect(parseX402Header(null)).toBeUndefined();
    // @ts-expect-error - testing invalid JS inputs
    expect(parseX402Header(undefined)).toBeUndefined();
    // @ts-expect-error - testing invalid JS inputs
    expect(parseX402Header(123)).toBeUndefined();
    expect(parseX402Header('')).toBeUndefined();
  });

  it('should return undefined if required fields receipt (x402) or service are missing', () => {
    expect(parseX402Header('x402=pay_123456')).toBeUndefined();
    expect(parseX402Header('service=ai-chat')).toBeUndefined();
    expect(parseX402Header('expiry=1700000000;amount=10')).toBeUndefined();
  });

  it('should parse a valid header with all fields', () => {
    const header = 'x402=pay_1234567890;service=ai-chat;expiry=1700000000;amount=10';
    const parsed = parseX402Header(header);
    expect(parsed).toEqual({
      receipt: 'pay_1234567890',
      service: 'ai-chat',
      expiry: 1700000000,
      amount: 10,
      raw: header,
    });
  });

  it('should handle whitespace around parts and values', () => {
    const header = '  x402=0xabc123  ;  service=mystic-oracle ; expiry=1800000000 ; amount=50  ';
    const parsed = parseX402Header(header);
    expect(parsed).toEqual({
      receipt: '0xabc123',
      service: 'mystic-oracle',
      expiry: 1800000000,
      amount: 50,
      raw: header,
    });
  });

  it('should parse header without optional fields expiry and amount', () => {
    const header = 'x402=pay_999;service=cafe-service';
    const parsed = parseX402Header(header);
    expect(parsed).toEqual({
      receipt: 'pay_999',
      service: 'cafe-service',
      expiry: undefined,
      amount: undefined,
      raw: header,
    });
  });

  it('should ignore non-numeric expiry or amount values', () => {
    const header = 'x402=pay_123;service=test;expiry=invalid;amount=abc';
    const parsed = parseX402Header(header);
    expect(parsed).toEqual({
      receipt: 'pay_123',
      service: 'test',
      expiry: undefined,
      amount: undefined,
      raw: header,
    });
  });
});
