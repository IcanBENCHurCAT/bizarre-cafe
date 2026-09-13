/**
 * Escrow Service
 *
 * Manages the lifecycle of escrowed micropayments for skill trades:
 * - lockFundsInEscrow: Verifies x402 payment, detects double-spends, and locks funds ('held')
 * - releaseEscrow: Releases held funds to seller upon trade completion ('released')
 * - refundEscrow: Refunds held funds to buyer upon trade cancellation ('refunded')
 * - Query and in-memory caching with SQLite/Supabase synchronization
 */

import { randomUUID } from 'crypto';
import { config } from '../../config';
import type { EscrowRecord, EscrowStatus } from '../../types/cafe';
import type { EscrowLockParams, EscrowReleaseResult, EscrowRefundResult } from './types';
import { verifyPaymentSubmission } from '../x402/index';
import {
  createSqliteEscrowRecord,
  getSqliteEscrowRecord,
  getSqliteEscrowByTradeId,
  updateSqliteEscrowRecord,
} from '../../db/sqlite';
import { createSupabaseClient } from '../../supabase/client';

export type { EscrowRecord, EscrowStatus, EscrowLockParams, EscrowReleaseResult, EscrowRefundResult };

// In-memory cache for escrows
const memEscrows = new Map<string, EscrowRecord>();

/**
 * Lock funds in escrow for a skill trade after verifying x402 payment.
 * Coordinates with antiDoubleSpend to ensure txId has not been replayed.
 */
export async function lockFundsInEscrow(params: EscrowLockParams): Promise<EscrowRecord> {
  const { tradeId, buyerAgentId, sellerAgentId, amountMicroAlgos, txId, receipt, paymentId } = params;

  if (!txId || typeof txId !== 'string' || !txId.trim()) {
    throw new Error('Missing transaction ID');
  }

  if (amountMicroAlgos <= 0) {
    throw new Error('Invalid escrow amount');
  }

  // 1. Verify payment submission and record spent transaction
  const verification = await verifyPaymentSubmission(
    {
      txId: txId.trim(),
      paymentId: paymentId || `escrow-${tradeId}`,
      receipt,
    },
    {
      amountMicroAlgos,
      serviceId: `escrow-${tradeId}`,
      receiverWallet: config.algorandReceiverWallet,
    },
  );

  if (!verification.verified) {
    throw new Error(verification.reason || 'PAYMENT_VERIFICATION_FAILED');
  }

  // 2. Create EscrowRecord
  const now = new Date().toISOString();
  const escrow: EscrowRecord = {
    id: randomUUID(),
    tradeId,
    buyerAgentId,
    sellerAgentId,
    amountMicroAlgos,
    txId: txId.trim(),
    status: 'held',
    createdAt: now,
    updatedAt: now,
  };

  // 3. Save to in-memory store
  memEscrows.set(escrow.id, escrow);

  // 4. Save to SQLite database
  try {
    await createSqliteEscrowRecord(escrow);
  } catch (err) {
    console.warn('[EscrowService] SQLite escrow persistence warning:', err);
  }

  // 5. Attempt Supabase persistence (optional / if table exists)
  if (!config.useLocalDb) {
    try {
      const supabase = createSupabaseClient();
      await (supabase as any).from('escrow_records').insert({
        id: escrow.id,
        trade_id: escrow.tradeId,
        buyer_agent_id: escrow.buyerAgentId,
        seller_agent_id: escrow.sellerAgentId,
        amount_micro_algos: escrow.amountMicroAlgos,
        tx_id: escrow.txId,
        status: escrow.status,
        created_at: escrow.createdAt,
        updated_at: escrow.updatedAt,
      });
    } catch {
      // Ignore Supabase errors when running locally or table not migrated
    }
  }

  return escrow;
}

/**
 * Retrieve an escrow record by its ID.
 * Checks in-memory cache first, then SQLite.
 */
export async function getEscrowRecord(id: string): Promise<EscrowRecord | null> {
  const cached = memEscrows.get(id);
  if (cached) return cached;

  try {
    const sqliteRecord = await getSqliteEscrowRecord(id);
    if (sqliteRecord) {
      memEscrows.set(sqliteRecord.id, sqliteRecord);
      return sqliteRecord;
    }
  } catch (err) {
    console.warn('[EscrowService] Error retrieving escrow from SQLite:', err);
  }

  return null;
}

/**
 * Retrieve an escrow record by its associated trade ID.
 */
export async function getEscrowByTradeId(tradeId: string): Promise<EscrowRecord | null> {
  for (const escrow of memEscrows.values()) {
    if (escrow.tradeId === tradeId) {
      return escrow;
    }
  }

  try {
    const sqliteRecord = await getSqliteEscrowByTradeId(tradeId);
    if (sqliteRecord) {
      memEscrows.set(sqliteRecord.id, sqliteRecord);
      return sqliteRecord;
    }
  } catch (err) {
    console.warn('[EscrowService] Error retrieving escrow by tradeId from SQLite:', err);
  }

  return null;
}

/**
 * Release escrowed funds to seller upon verified trade delivery.
 */
export async function releaseEscrow(escrowId: string, callerAgentId: string): Promise<EscrowRecord> {
  let escrow = await getEscrowRecord(escrowId);
  if (!escrow) {
    escrow = await getEscrowByTradeId(escrowId);
  }

  if (!escrow) {
    throw new Error('Escrow record not found');
  }

  // Caller authorization: must be a trade participant (buyer or seller)
  if (callerAgentId !== escrow.buyerAgentId && callerAgentId !== escrow.sellerAgentId) {
    throw new Error('FORBIDDEN: Not authorized to release this escrow');
  }

  if (escrow.status !== 'held') {
    throw new Error(`Cannot release escrow with status: ${escrow.status}`);
  }

  const now = new Date().toISOString();
  escrow.status = 'released';
  escrow.releasedAt = now;
  escrow.updatedAt = now;

  // Update in-memory
  memEscrows.set(escrow.id, escrow);

  // Update SQLite
  try {
    await updateSqliteEscrowRecord(escrow.id, {
      status: 'released',
      releasedAt: now,
      updatedAt: now,
    });
  } catch (err) {
    console.warn('[EscrowService] Error updating escrow in SQLite:', err);
  }

  // Update Supabase if available
  if (!config.useLocalDb) {
    try {
      const supabase = createSupabaseClient();
      await (supabase as any)
        .from('escrow_records')
        .update({
          status: 'released',
          released_at: now,
          updated_at: now,
        })
        .eq('id', escrow.id);
    } catch {
      // Supabase optional
    }
  }

  return escrow;
}

/**
 * Refund escrowed funds to buyer upon trade cancellation or dispute.
 */
export async function refundEscrow(escrowId: string, callerAgentId: string): Promise<EscrowRecord> {
  let escrow = await getEscrowRecord(escrowId);
  if (!escrow) {
    escrow = await getEscrowByTradeId(escrowId);
  }

  if (!escrow) {
    throw new Error('Escrow record not found');
  }

  // Caller authorization: must be a trade participant (buyer or seller)
  if (callerAgentId !== escrow.buyerAgentId && callerAgentId !== escrow.sellerAgentId) {
    throw new Error('FORBIDDEN: Not authorized to refund this escrow');
  }

  if (escrow.status !== 'held') {
    throw new Error(`Cannot refund escrow with status: ${escrow.status}`);
  }

  const now = new Date().toISOString();
  escrow.status = 'refunded';
  escrow.refundedAt = now;
  escrow.updatedAt = now;

  // Update in-memory
  memEscrows.set(escrow.id, escrow);

  // Update SQLite
  try {
    await updateSqliteEscrowRecord(escrow.id, {
      status: 'refunded',
      refundedAt: now,
      updatedAt: now,
    });
  } catch (err) {
    console.warn('[EscrowService] Error updating escrow in SQLite:', err);
  }

  // Update Supabase if available
  if (!config.useLocalDb) {
    try {
      const supabase = createSupabaseClient();
      await (supabase as any)
        .from('escrow_records')
        .update({
          status: 'refunded',
          refunded_at: now,
          updated_at: now,
        })
        .eq('id', escrow.id);
    } catch {
      // Supabase optional
    }
  }

  return escrow;
}

/**
 * Clear in-memory escrow store (for test resets).
 */
export function clearMemEscrows(): void {
  memEscrows.clear();
}
