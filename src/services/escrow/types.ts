/**
 * Escrow Service Domain Types
 *
 * Types and interfaces for autonomous skill marketplace escrow settlements.
 */

import type { EscrowRecord, EscrowStatus } from '../../types/cafe';

export type { EscrowRecord, EscrowStatus };

export interface EscrowLockParams {
  tradeId: string;
  buyerAgentId: string;
  sellerAgentId: string;
  amountMicroAlgos: number;
  txId: string;
  receipt?: string;
  paymentId?: string;
}

export interface EscrowReleaseResult {
  success: boolean;
  escrow: EscrowRecord;
  tradeId: string;
  settledAmount: number;
  releasedAt: string;
}

export interface EscrowRefundResult {
  success: boolean;
  escrow: EscrowRecord;
  tradeId: string;
  refundedAmount: number;
  refundedAt: string;
}
