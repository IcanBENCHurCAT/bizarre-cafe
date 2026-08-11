import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateId } from '../src/utils/index.js';

describe('generateId', () => {
  let originalRandomUUID: typeof crypto.randomUUID | undefined;

  beforeEach(() => {
    // Save original randomUUID if it exists
    originalRandomUUID = crypto.randomUUID;
  });

  afterEach(() => {
    // Restore original randomUUID
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
      // randomUUID typically produces a 36-char string
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
      // Force fallback path by mocking crypto.randomUUID to undefined or removing it
      // Note: Object.defineProperty is safer than simple assignment on global object
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
      // Timestamp + random combo should contain a hyphen
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
