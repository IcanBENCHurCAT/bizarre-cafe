import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateId, withRetrySync, generateNonce, validateReceipt, parseX402Header, formatMessageList, FormattedMessage } from '../src/utils/index.js';

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

    it('should fallback and generate a valid ID without a prefix', () => {
      const id = generateId();
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
      expect(id).toContain('-');
    });

    it('should fallback and generate a valid ID with a prefix', () => {
      const prefix = 'fallback_test';
      const id = generateId(prefix);
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.startsWith(`${prefix}_`)).toBe(true);
      expect(id).toContain('-');
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
    expect(fn).toHaveBeenCalledTimes(3);
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
      '[retry-sync] Attempt 1/4 failed: String error.',
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
