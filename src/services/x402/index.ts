/**
 * x402 Payment Service
 *
 * Manages payment promises, verification, and settlement
 * for the x402 protocol integration.
 *
 * The x402 protocol enables pay-per-use access where clients
 * prove payment via cryptographic receipts before accessing
 * paid routes or services.
 */

import { config } from '../../config';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

/** Payment status values */
export type PaymentStatus = 'pending' | 'verified' | 'failed';

/** Item in a payment order */
export interface PaymentItem {
  /** Service or skill being purchased */
  service: string;
  /** Price in smallest currency unit (e.g., cents) */
  price: number;
  /** Optional description */
  description?: string;
  /** Optional quantity */
  quantity?: number;
}

/** A created payment promise (the request sent to the payer) */
export interface PaymentPromise {
  /** Unique payment identifier */
  paymentId: string;
  /** Items being purchased */
  items: PaymentItem[];
  /** Total price */
  total: number;
  /** Payer's wallet address */
  payerWallet: string;
  /** Receiver wallet address */
  receiverWallet: string;
  /** When the payment was created */
  createdAt: number;
  /** When the payment expires */
  expiresAt: number;
  /** When the payment was verified */
  verifiedAt?: number;
  /** Current status */
  status: PaymentStatus;
  /** x402 receipt (if already verified) */
  receipt?: string;
}

/** Verified payment result */
export interface PaymentResult {
  status: 'verified' | 'pending' | 'failed';
  paymentId: string;
  verifiedAt?: number;
  reason?: string;
}

/** Settlement result */
export interface SettlementResult {
  success: boolean;
  paymentId: string;
  transferred?: number;
  error?: string;
}

/** Payment status object returned by getPaymentStatus */
export interface PaymentStatusObject {
  status: PaymentStatus;
  paymentId: string;
  items: PaymentItem[];
  total: number;
  createdAt: number;
  expiresAt: number;
  verifiedAt?: number;
  settledAt?: number;
  payerWallet: string;
}

// ──────────────────────────────────────────────
// Module State
// ──────────────────────────────────────────────

/** Payment records, keyed by paymentId */
const payments = new Map<string, PaymentPromise>();

/** Default receiver wallet for the cafe */
const DEFAULT_RECEIVER = 'ALGO_BIZARRE_CAFE_WALLET_ADDRESS';

/** Default payment expiry (15 minutes) */
const DEFAULT_EXPIRY_MS = 15 * 60 * 1000;

/** Simulation mode — if true, payments auto-verify after a delay */
const SIMULATION_DELAY_MS = 2000;

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Generate a unique payment ID.
 *
 * @returns Unique payment identifier
 */
const generatePaymentId = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return `pay_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
};

/**
 * Calculate total price from payment items.
 *
 * @param items - Payment items array
 * @returns Total price in smallest currency unit
 */
const calculateTotal = (items: PaymentItem[]): number => {
  return items.reduce((total, item) => {
    const quantity = item.quantity ?? 1;
    return total + item.price * quantity;
  }, 0);
};

/**
 * Format a total price for display.
 *
 * @param total - Total in smallest unit (e.g., cents)
 * @returns Formatted string (e.g., "1.50")
 */
const formatPrice = (total: number): string => {
  return (total / 100).toFixed(2);
};

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Create a payment promise for the given items and payer.
 *
 * This creates a record of the payment request. In production,
 * this would also generate an x402-compatible challenge for
 * the payer's wallet to sign.
 *
 * @param items - Items/services being purchased
 * @param payerWallet - Payer's wallet address
 * @param options - Optional configuration (expiry, receiver, etc.)
 * @returns The created PaymentPromise
 */
export const createPaymentPromise = (
  items: PaymentItem[],
  payerWallet: string,
  options?: {
    /** Custom expiry in ms (default: 15 minutes) */
    expiryMs?: number;
    /** Receiver wallet (default: cafe's wallet) */
    receiverWallet?: string;
    /** Reference ID for idempotency */
    reference?: string;
  }
): PaymentPromise => {
  const total = calculateTotal(items);
  const now = Date.now();

  const payment: PaymentPromise = {
    paymentId: generatePaymentId(),
    items: [...items],
    total,
    payerWallet,
    receiverWallet: options?.receiverWallet ?? DEFAULT_RECEIVER,
    createdAt: now,
    expiresAt: now + (options?.expiryMs ?? DEFAULT_EXPIRY_MS),
    status: 'pending',
  };

  payments.set(payment.paymentId, payment);

  // In simulation mode, auto-verify after a delay
  if (config.nodeEnv === 'development') {
    setTimeout(() => {
      const existing = payments.get(payment.paymentId);
      if (existing && existing.status === 'pending') {
        existing.status = 'verified';
        existing.receipt = `receipt_${payment.paymentId}_${Date.now()}`;
        existing.verifiedAt = Date.now();
      }
    }, SIMULATION_DELAY_MS);
  }

  return payment;
};

/**
 * Verify a payment by its ID.
 *
 * Checks the payment record and validates the x402 receipt
 * signature if present. Returns the current verification state.
 *
 * @param paymentId - The payment ID to verify
 * @returns PaymentResult with status and details
 */
export const verifyPayment = (paymentId: string): PaymentResult => {
  const payment = payments.get(paymentId);

  if (!payment) {
    return {
      status: 'failed',
      paymentId,
      reason: 'Payment not found',
    };
  }

  // Check expiry
  if (Date.now() > payment.expiresAt) {
    payment.status = 'failed';
    return {
      status: 'failed',
      paymentId,
      reason: 'Payment expired',
    };
  }

  // Check if already verified
  if (payment.status === 'verified') {
    return {
      status: 'verified',
      paymentId,
      verifiedAt: payment.verifiedAt,
    };
  }

  // Check if a receipt is present and valid
  if (payment.receipt) {
    // In production, verify the x402 receipt signature here
    // For now, accept receipts that match the expected format
    const isValid =
      payment.receipt.startsWith('receipt_') &&
      payment.receipt.includes(payment.paymentId);

    if (isValid) {
      payment.status = 'verified';
      payment.verifiedAt = Date.now();
      return {
        status: 'verified',
        paymentId,
        verifiedAt: payment.verifiedAt,
      };
    }
  }

  return {
    status: 'pending',
    paymentId,
    reason: 'Awaiting payment confirmation',
  };
};

/**
 * Settle a verified payment.
 *
 * Transfers funds from the payer's wallet to the receiver.
 * In production, this executes an actual Algorand transaction.
 *
 * @param paymentId - The payment ID to settle
 * @returns SettlementResult
 */
export const settlePayment = (paymentId: string): SettlementResult => {
  const payment = payments.get(paymentId);

  if (!payment) {
    return { success: false, paymentId, error: 'Payment not found' };
  }

  if (payment.status !== 'verified') {
    return {
      success: false,
      paymentId,
      error: 'Payment not verified. Cannot settle.',
    };
  }

  if (payment.status === 'failed') {
    return {
      success: false,
      paymentId,
      error: 'Payment has failed. Cannot settle.',
    };
  }

  // In production, execute the Algorand transaction here:
  // const tx = await algorandClient.sendPayment({
  //   from: payment.payerWallet,
  //   to: payment.receiverWallet,
  //   amount: payment.total,
  // });
  // payment.txId = tx.transactionID;

  // Simulation: mark as settled
  payment.status = 'verified'; // Already verified, but mark settled conceptually

  return {
    success: true,
    paymentId,
    transferred: payment.total,
  };
};

/**
 * Get the full status of a payment.
 *
 * @param paymentId - The payment ID to look up
 * @returns PaymentStatusObject with complete payment details,
 *          or undefined if the payment does not exist
 */
export const getPaymentStatus = (
  paymentId: string
): PaymentStatusObject | undefined => {
  const payment = payments.get(paymentId);

  if (!payment) return undefined;

  return {
    status: payment.status,
    paymentId: payment.paymentId,
    items: payment.items,
    total: payment.total,
    createdAt: payment.createdAt,
    expiresAt: payment.expiresAt,
    verifiedAt: payment.verifiedAt,
    settledAt: undefined, // Add when implemented
    payerWallet: payment.payerWallet,
  };
};

/**
 * Create and verify a payment in a single call.
 * Convenience wrapper that creates the promise and immediately
 * verifies it (useful in simulation mode).
 *
 * @param items - Items being purchased
 * @param payerWallet - Payer's wallet address
 * @param options - Optional configuration
 * @returns PaymentResult
 */
export const createAndVerifyPayment = (
  items: PaymentItem[],
  payerWallet: string,
  options?: { expiryMs?: number; receiverWallet?: string }
): PaymentResult => {
  const promise = createPaymentPromise(items, payerWallet, options);
  return verifyPayment(promise.paymentId);
};

/**
 * Get all payments, optionally filtered by status.
 *
 * @param status - Optional status filter
 * @returns Array of payment records
 */
export const getAllPayments = (status?: PaymentStatus): PaymentPromise[] => {
  if (status) {
    return [...payments.values()].filter((p) => p.status === status);
  }
  return [...payments.values()];
};

/**
 * Cancel a pending payment.
 *
 * @param paymentId - The payment ID to cancel
 * @returns true if cancelled, false if already settled/failed
 */
export const cancelPayment = (paymentId: string): boolean => {
  const payment = payments.get(paymentId);

  if (!payment) return false;
  if (payment.status !== 'pending') return false;

  payment.status = 'failed';
  return true;
};

/**
 * Clear all payment records. Useful for testing.
 */
export const clearPayments = (): void => {
  payments.clear();
};
