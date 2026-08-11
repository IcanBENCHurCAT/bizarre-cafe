import { describe, it, expect } from 'vitest';
import { generateNonce } from '../src/utils/index.js';

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
