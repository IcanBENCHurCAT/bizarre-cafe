import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  verifyPayment,
  createPaymentPromise,
  clearPayments,
  PaymentItem,
} from '../src/services/x402/index';

describe('x402 Payment Service - createPaymentPromise', () => {
  beforeEach(() => {
    clearPayments();
    vi.restoreAllMocks();
  });

  const dummyItems: PaymentItem[] = [
    { service: 'Espresso', price: 250, quantity: 1 },
  ];
  const payerWallet = 'ALGO_SENDER_WALLET';

  it('should generate a payment promise with a valid UUID paymentId', () => {
    const payment = createPaymentPromise(dummyItems, payerWallet);
    expect(payment.paymentId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('should throw an error if crypto.randomUUID fails instead of falling back to Math.random', () => {
    const spy = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('crypto.randomUUID unavailable');
    });

    expect(() => createPaymentPromise(dummyItems, payerWallet)).toThrow(
      'crypto.randomUUID unavailable',
    );

    spy.mockRestore();
  });
});

describe('x402 Payment Service - verifyPayment', () => {
  beforeEach(() => {
    clearPayments();
  });

  const dummyItems: PaymentItem[] = [
    { service: 'Espresso', price: 250, quantity: 1 },
  ];
  const payerWallet = 'ALGO_SENDER_WALLET';

  it('should return failed and reason "Payment not found" for non-existent paymentId', () => {
    const result = verifyPayment('non-existent-id');
    expect(result).toEqual({
      status: 'failed',
      paymentId: 'non-existent-id',
      reason: 'Payment not found',
    });
  });

  it('should return failed and reason "Payment expired" for expired payment', () => {
    // Create payment with negative/expired expiryMs
    const payment = createPaymentPromise(dummyItems, payerWallet, { expiryMs: -1000 });
    const result = verifyPayment(payment.paymentId);
    expect(result).toEqual({
      status: 'failed',
      paymentId: payment.paymentId,
      reason: 'Payment expired',
    });
    // Check if state is updated
    expect(payment.status).toBe('failed');
  });

  it('should return verified for already verified payment', () => {
    const payment = createPaymentPromise(dummyItems, payerWallet);
    payment.status = 'verified';
    payment.verifiedAt = 123456789;

    const result = verifyPayment(payment.paymentId);
    expect(result).toEqual({
      status: 'verified',
      paymentId: payment.paymentId,
      verifiedAt: 123456789,
    });
  });

  it('should return verified and set status when a valid receipt is provided', () => {
    const payment = createPaymentPromise(dummyItems, payerWallet);
    payment.receipt = `receipt_${payment.paymentId}_something`;

    const result = verifyPayment(payment.paymentId);
    expect(result.status).toBe('verified');
    expect(result.paymentId).toBe(payment.paymentId);
    expect(result.verifiedAt).toBeGreaterThan(0);
    expect(payment.status).toBe('verified');
    expect(payment.verifiedAt).toBe(result.verifiedAt);
  });

  it('should return pending and reason "Awaiting payment confirmation" for invalid receipt format', () => {
    const payment = createPaymentPromise(dummyItems, payerWallet);
    payment.receipt = 'invalid_receipt_format';

    const result = verifyPayment(payment.paymentId);
    expect(result).toEqual({
      status: 'pending',
      paymentId: payment.paymentId,
      reason: 'Awaiting payment confirmation',
    });
    expect(payment.status).toBe('pending');
  });

  it('should return pending and reason "Awaiting payment confirmation" for payment awaiting confirmation (no receipt)', () => {
    const payment = createPaymentPromise(dummyItems, payerWallet);
    const result = verifyPayment(payment.paymentId);
    expect(result).toEqual({
      status: 'pending',
      paymentId: payment.paymentId,
      reason: 'Awaiting payment confirmation',
    });
  });
});
