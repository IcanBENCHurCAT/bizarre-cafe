/**
 * x402 Payment Service
 *
 * Re-exports the unified x402 payment engine from ./x402/index.
 */

export * from './x402/index';

import {
  createPaymentPromise,
  verifyPayment as verifyPromise,
  settlePayment as settlePromise,
  clearPayments,
  type PaymentPromise,
  type PaymentResult,
  type SettlementResult,
} from './x402/index';

export interface LegacyPaymentRequest {
  id: string;
  agentId: string;
  amount: number;
  currency: string;
  route: string;
  status: 'created' | 'verified' | 'settled' | 'failed';
  createdAt: number;
  receipt?: string;
}

export function createPayment(
  agentId: string,
  amount: number,
  currency: string,
  route: string,
): LegacyPaymentRequest {
  const promise: PaymentPromise = createPaymentPromise(
    [{ service: route, price: amount, description: `Access to ${route}` }],
    agentId,
  );
  return {
    id: promise.paymentId,
    agentId,
    amount,
    currency,
    route,
    status: 'created',
    createdAt: promise.createdAt,
    receipt: promise.receipt,
  };
}

export function verifyPayment(paymentId: string, _receipt?: string): { paymentId: string; verified: boolean; receipt?: string } {
  const res: PaymentResult = verifyPromise(paymentId);
  return {
    paymentId,
    verified: res.status === 'verified',
  };
}

export function settlePayment(paymentId: string): SettlementResult {
  return settlePromise(paymentId);
}

export function resetStore(): void {
  clearPayments();
}

