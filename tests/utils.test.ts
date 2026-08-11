import { describe, it, expect } from 'vitest';
import { validateReceipt } from '../src/utils/index';

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
