/**
 * x402 Payment Service
 *
 * Manages the full payment lifecycle:
 *   createPayment → verifyPayment → settlePayment
 *
 * Uses an in-memory store for testing; in production this would
 * use Supabase or a ledger table.
 */

import crypto from 'node:crypto';

export interface PaymentRequest {
  id: string;
  agentId: string;
  amount: number;
  currency: string;
  route: string;
  status: 'created' | 'verified' | 'settled' | 'failed';
  createdAt: number;
  receipt?: string;
}

export interface SettlementResult {
  paymentId: string;
  status: 'settled';
  settledAt: number;
  transactionId?: string;
}

export interface VerificationResult {
  paymentId: string;
  verified: boolean;
  receipt?: string;
}

interface PaymentStore {
  payments: Map<string, PaymentRequest>;
}

const store: PaymentStore = {
  payments: new Map(),
};

/**
 * Generate a unique ID (inline to avoid circular deps).
 */
function generateId(length = 32): string {
  return crypto.randomBytes(length / 2).toString('hex');
}

/**
 * Create a new payment request.
 */
export function createPayment(
  agentId: string,
  amount: number,
  currency: string,
  route: string,
): PaymentRequest {
  const id = generateId();
  const payment: PaymentRequest = {
    id,
    agentId,
    amount,
    currency,
    route,
    status: 'created',
    createdAt: Date.now(),
  };
  store.payments.set(id, payment);
  return payment;
}

/**
 * Verify a payment receipt against a payment request.
 *
 * In production this would validate a cryptographic receipt.
 * For testing, any non-empty receipt string is considered valid.
 */
export function verifyPayment(
  paymentId: string,
  receipt: string,
): VerificationResult {
  const payment = store.payments.get(paymentId);
  if (!payment) {
    return { paymentId, verified: false };
  }

  if (payment.status !== 'created') {
    return { paymentId, verified: false };
  }

  if (!receipt || typeof receipt !== 'string' || receipt.length === 0) {
    return { paymentId, verified: false };
  }

  payment.status = 'verified';
  payment.receipt = receipt;

  return {
    paymentId,
    verified: true,
    receipt,
  };
}

/**
 * Settle a verified payment on the blockchain.
 */
export function settlePayment(paymentId: string): SettlementResult {
  const payment = store.payments.get(paymentId);
  if (!payment) {
    throw new Error(`Payment ${paymentId} not found`);
  }

  if (payment.status !== 'verified') {
    throw new Error(`Payment ${paymentId} is not verified (current: ${payment.status})`);
  }

  const transactionId = generateId();
  payment.status = 'settled';
  payment.receipt = `tx:${transactionId}`;

  return {
    paymentId,
    status: 'settled',
    settledAt: Date.now(),
    transactionId,
  };
}

/**
 * Reset the in-memory store (useful for tests).
 */
export function resetStore(): void {
  store.payments.clear();
}
