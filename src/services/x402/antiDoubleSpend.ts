/**
 * Anti-Double-Spend Service
 *
 * Prevents transaction replay attacks through a two-layer verification strategy:
 * 1. In-memory fast cache (LRU-evicted Map with timestamp TTL)
 * 2. Persistent storage query against x402_payments via the active DatabaseAdapter (SQLite / Supabase)
 */

import { db } from '../../db';

export interface SpentPaymentDetails {
  txId: string;
  amount: number;
  payer: string;
  receiver: string;
  serviceId: string;
  proposalId?: string;
}

interface CacheEntry {
  recordedAt: number;
  amount?: number;
  payer?: string;
  receiver?: string;
}

const MAX_CACHE_ENTRIES = 100_000;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory cache keyed by txId
const spentTxCache = new Map<string, CacheEntry>();
const inFlightSpending = new Set<string>();

function addToCache(txId: string, extra?: Partial<CacheEntry>): void {
  if (spentTxCache.size >= MAX_CACHE_ENTRIES) {
    // Evict oldest entry (LRU)
    const firstKey = spentTxCache.keys().next().value;
    if (firstKey) spentTxCache.delete(firstKey);
  }
  spentTxCache.set(txId, {
    recordedAt: Date.now(),
    ...extra,
  });
}

/**
 * Check if a transaction has already been spent.
 * First checks fast in-memory cache, then checks persistent database.
 */
export async function isTransactionSpent(txId: string): Promise<boolean> {
  if (!txId || typeof txId !== 'string') {
    return false;
  }

  const normalizedTxId = txId.trim();
  if (!normalizedTxId) {
    return false;
  }

  // 1. Check in-memory cache
  const cached = spentTxCache.get(normalizedTxId);
  if (cached) {
    if (Date.now() - cached.recordedAt <= DEFAULT_TTL_MS) {
      return true;
    }
    spentTxCache.delete(normalizedTxId);
  }

  // 2. Check persistent database
  try {
    const existsInDb = await db.payments.hasTxnHash(normalizedTxId);
    if (existsInDb) {
      // Re-populate memory cache
      addToCache(normalizedTxId);
      return true;
    }
  } catch (err) {
    console.error(`[AntiDoubleSpend] Error checking database for tx ${normalizedTxId}:`, err);
  }

  return false;
}

/**
 * Record a transaction as spent.
 * Adds to in-memory cache and persists to database.
 * Throws DOUBLE_SPEND_DETECTED if transaction was already recorded.
 */
export async function recordSpentTransaction(payment: SpentPaymentDetails): Promise<void> {
  const normalizedTxId = payment.txId.trim();

  // Check in-flight set immediately (synchronous check prevents race before await)
  if (inFlightSpending.has(normalizedTxId)) {
    throw new Error('DOUBLE_SPEND_DETECTED');
  }

  // Reserve lock
  inFlightSpending.add(normalizedTxId);

  try {
    // Check if already spent
    const alreadySpent = await isTransactionSpent(normalizedTxId);
    if (alreadySpent) {
      throw new Error('DOUBLE_SPEND_DETECTED');
    }

    // Add to in-memory cache immediately (optimistic concurrency)
    addToCache(normalizedTxId, {
      amount: payment.amount,
      payer: payment.payer,
      receiver: payment.receiver,
    });

    // Persist to database
    try {
      await db.payments.recordPayment({
        txn_hash: normalizedTxId,
        proposal_id: payment.proposalId || payment.serviceId,
        amount: payment.amount,
        from_address: payment.payer,
        to_address: payment.receiver,
        status: 'settled',
        receipt: null,
      });
    } catch (err: unknown) {
      const error = err as { message?: string; code?: string };
      if (
        error?.message?.includes('UNIQUE') ||
        error?.message?.includes('conflict') ||
        error?.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
        error?.code === '23505'
      ) {
        throw new Error('DOUBLE_SPEND_DETECTED');
      }
      throw err;
    }
  } finally {
    inFlightSpending.delete(normalizedTxId);
  }
}

/**
 * Clear in-memory spent transactions cache (for testing cleanup).
 */
export function clearSpentTransactions(): void {
  spentTxCache.clear();
  inFlightSpending.clear();
}

/**
 * For test inspection: get cache size.
 */
export function getSpentTransactionsCacheSize(): number {
  return spentTxCache.size;
}
