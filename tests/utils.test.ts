import { describe, it, expect } from 'vitest';
import { generateShortId } from '../src/utils';

describe('generateShortId', () => {
  it('should generate a short ID of default length 8 when no arguments are provided', () => {
    const id = generateShortId();
    expect(id).toBeTypeOf('string');
    expect(id).toHaveLength(8);
  });

  it('should generate a short ID of a custom specified length', () => {
    const lengths = [1, 5, 10, 16, 32];
    for (const length of lengths) {
      const id = generateShortId(length);
      expect(id).toHaveLength(length);
    }
  });

  it('should only contain characters from the specified set (lowercase a-z and 0-9)', () => {
    const validChars = /^[a-z0-9]+$/;
    for (let i = 0; i < 100; i++) {
      const id = generateShortId(12);
      expect(id).toMatch(validChars);
    }
  });

  it('should return empty string when length is 0', () => {
    const id = generateShortId(0);
    expect(id).toBe('');
  });

  it('should generate different IDs across consecutive calls (randomness check)', () => {
    const ids = new Set<string>();
    const iterations = 100;
    for (let i = 0; i < iterations; i++) {
      ids.add(generateShortId(8));
    }
    // With a length of 8 and 36 possible characters, the chance of collision in 100 iterations is extremely close to 0.
    expect(ids.size).toBe(iterations);
  });
});
