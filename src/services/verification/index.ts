/**
 * Agent Verification Service
 *
 * Handles DID (Decentralized Identifier) verification using
 * wallet-based signature challenges. Agents prove ownership
 * of their identity by signing a nonce with their private key.
 *
 * Flow:
 *  1. Agent requests challenge with their DID
 *  2. Server issues a signed challenge with a random nonce
 *  3. Agent signs the challenge with their wallet
 *  4. Server verifies the signature against the DID's associated wallet
 *  5. Server records verification status
 */



import { verifyAgentDID } from '../identity/did';
import { createToken } from '../../middleware/auth';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

/** Verification status of an agent */
export type AgentStatusType = 'unverified' | 'challenged' | 'verified' | 'revoked' | 'expired';

/** Challenge issued to an agent */
export interface Challenge {
  /** Unique challenge ID */
  challengeId: string;
  /** The agent's DID */
  did: string;
  /** Random nonce to sign */
  nonce: string;
  /** The message to sign (nonce formatted for verification) */
  message: string;
  /** When the challenge was issued */
  issuedAt: number;
  /** When the challenge expires (5 minutes) */
  expiresAt: number;
}

/** Verification result */
export interface VerificationResult {
  /** Whether verification succeeded */
  verified: boolean;
  /** DID that was verified */
  did: string;
  /** Signed session JWT issued upon successful verification */
  token?: string;
  /** Reason if verification failed */
  reason?: string;
  /** Verified timestamp if successful */
  verifiedAt?: number;
}

/** Stored challenge for later verification */
interface StoredChallenge {
  challengeId: string;
  did: string;
  nonce: string;
  message: string;
  issuedAt: number;
  expiresAt: number;
}

/** Agent verification record */
export interface AgentRecord {
  did: string;
  status: AgentStatusType;
  verifiedAt?: number;
  revokedAt?: number;
  expiresAt?: number;
  challengeCount: number;
  lastSeen: number;
}

/** Status object returned by getAgentStatus */
export interface AgentStatusObject {
  did: string;
  status: AgentStatusType;
  verifiedAt?: number;
  revokedAt?: number;
  expiresAt?: number;
  challengeCount: number;
  lastSeen: number;
  canVerify: boolean;
}

// ──────────────────────────────────────────────
// Module State
// ──────────────────────────────────────────────

/** Active challenges, keyed by nonce */
const challenges = new Map<string, StoredChallenge>();

/** Agent records, keyed by DID */
const agents = new Map<string, AgentRecord>();

/** Challenge TTL (5 minutes) */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Maximum challenges per agent per window */
const MAX_CHALLENGES_PER_HOUR = 20;

/** Challenge window (1 hour) */
const CHALLENGE_WINDOW_MS = 60 * 60 * 1000;

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Generate a cryptographically secure nonce.
 *
 * @param length - Number of bytes (default 32)
 * @returns Hex string nonce
 */
const generateNonce = (length: number = 32): string => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  // ⚡ Bolt Optimization: Avoid O(N) memory allocation from Array.from() + map() + join()
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
};

/**
 * Hash a nonce for secure storage.
 * In production, use a proper hash function.
 *
 * @param nonce - The raw nonce
 * @returns Hashed nonce
 */
export const hashNonce = (nonce: string): Promise<string> => {
  // Use Web Crypto API if available
  if (crypto.subtle && crypto.subtle.digest) {
    const encoder = new TextEncoder();
    const data = encoder.encode(nonce);
    return crypto.subtle.digest('SHA-256', data).then((hashBuffer) => {
      const hashBytes = new Uint8Array(hashBuffer);

      // ⚡ Bolt Optimization: Avoid O(N) memory allocation from Array.from() + map() + join()
      let hex = '';
      for (let i = 0; i < hashBytes.length; i++) {
        hex += hashBytes[i].toString(16).padStart(2, '0');
      }
      return hex;
    });
  }

  // Fallback: simple hash
  let hash = 0;
  for (let i = 0; i < nonce.length; i++) {
    const char = nonce.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Promise.resolve(`hash_${Math.abs(hash).toString(16).padStart(8, '0')}`);
};

/**
 * Format the challenge message that the agent needs to sign.
 *
 * @param nonce - The nonce to include in the message
 * @param did - The agent's DID
 * @returns Formatted message string
 */
const formatChallengeMessage = (nonce: string, did: string): string => {
  return `Bizarre Cafe Verification\nDID: ${did}\nNonce: ${nonce}\nTimestamp: ${Date.now()}`;
};



/**
 * Clean up expired challenges from memory.
 */
const cleanupExpiredChallenges = (): void => {
  const now = Date.now();
  for (const [id, challenge] of challenges.entries()) {
    if (now > challenge.expiresAt) {
      challenges.delete(id);
    }
  }
};

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Issue a challenge to an agent for DID verification.
 *
 * Generates a random nonce, formats the challenge message,
 * and stores it for later verification.
 *
 * @param did - The agent's Decentralized Identifier
 * @returns Challenge object with message to sign
 */
export const challengeAgent = async (did: string): Promise<Challenge> => {
  // Cleanup old challenges periodically
  cleanupExpiredChallenges();

  // Check challenge rate limit
  const agentRecord = agents.get(did);
  if (agentRecord) {
    const now = Date.now();
    const _windowStart = now - CHALLENGE_WINDOW_MS;
    const recentChallenges = agentRecord.challengeCount;

    if (recentChallenges > MAX_CHALLENGES_PER_HOUR) {
      throw new Error('Too many challenges. Rate limit exceeded. Try again later.');
    }
  }

  // Generate nonce and challenge
  const nonce = generateNonce();
  const message = formatChallengeMessage(nonce, did);
  const challengeId = crypto.randomUUID();
  const now = Date.now();

  const challenge: Challenge = {
    challengeId,
    did,
    nonce,
    message,
    issuedAt: now,
    expiresAt: now + CHALLENGE_TTL_MS,
  };

  // Store the challenge (store hashed nonce for security)
  const storedChallenge: StoredChallenge = {
    ...challenge,
    nonce, // Store raw nonce for verification (in production, store hash + encrypted nonce)
  };
  challenges.set(nonce, storedChallenge);

  // Update agent record
  if (agentRecord) {
    agentRecord.challengeCount += 1;
    agentRecord.lastSeen = now;
    agentRecord.status = 'challenged';
  } else {
    agents.set(did, {
      did,
      status: 'challenged',
      challengeCount: 1,
      lastSeen: now,
    });
  }

  return challenge;
};

/**
 * Verify an agent's signature against a challenge.
 *
 * Checks that:
 *  1. The challenge exists and hasn't expired
 *  2. The signature is valid for the challenge message
 *  3. The DID matches
 *
 * @param did - The agent's DID
 * @param signature - The signature to verify (hex or base64)
 * @param nonce - The nonce that was signed
 * @returns VerificationResult with verified boolean
 */
export const verifyAgent = async (
  did: string,
  signature: string,
  nonce: string,
): Promise<VerificationResult> => {
  // Find a valid, non-expired challenge matching this nonce
  const challenge = challenges.get(nonce);
  const validChallenge =
    challenge && challenge.did === did && Date.now() <= challenge.expiresAt ? challenge : undefined;

  if (!validChallenge) {
    return {
      verified: false,
      did,
      reason: 'No valid challenge found. Request a new challenge.',
    };
  }

  // Verify the signature against the challenge message or raw nonce
  const msgOutcome = await verifyAgentDID(did, signature, validChallenge.message);
  const nonceOutcome = !msgOutcome.verified
    ? await verifyAgentDID(did, signature, validChallenge.nonce)
    : msgOutcome;

  const isValid = msgOutcome.verified || nonceOutcome.verified;

  if (isValid) {
    // Update agent record
    const now = Date.now();
    agents.set(did, {
      did,
      status: 'verified',
      verifiedAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000, // 30 days
      challengeCount: (agents.get(did)?.challengeCount ?? 0) + 1,
      lastSeen: now,
    });

    // Remove the used challenge
    challenges.delete(nonce);

    // Generate session JWT
    const token = await createToken({
      agentId: did,
      tier: 'basic',
      walletAddress:
        did.startsWith('did:algo:') || did.startsWith('ALGO:')
          ? did.replace(/^did:algo:/, '')
          : undefined,
    });

    return {
      verified: true,
      did,
      token,
      verifiedAt: now,
    };
  }

  const reason =
    msgOutcome.reason ??
    nonceOutcome.reason ??
    'Invalid signature. The signed message does not match the challenge.';

  return {
    verified: false,
    did,
    reason,
  };
};

/**
 * Get the verification status of an agent.
 *
 * @param did - The agent's DID
 * @returns AgentStatusObject with full status details
 */
export const getAgentStatus = (did: string): AgentStatusObject => {
  const record = agents.get(did);

  const base: AgentStatusObject = {
    did,
    status: 'unverified',
    challengeCount: 0,
    lastSeen: 0,
    canVerify: false,
  };

  if (!record) return base;

  // Check if expired
  if (record.expiresAt && Date.now() > record.expiresAt) {
    record.status = 'expired';
    record.expiresAt = Date.now();
  }

  return {
    ...record,
    canVerify: record.status === 'unverified' || record.status === 'expired',
  };
};

/**
 * Revoke an agent's verification.
 *
 * @param did - The agent's DID
 * @returns true if revoked, false if not found or already revoked
 */
export const revokeAgent = (did: string): boolean => {
  const record = agents.get(did);
  if (!record) return false;
  if (record.status === 'revoked') return false;

  record.status = 'revoked';
  record.revokedAt = Date.now();

  return true;
};

/**
 * Get all agent records.
 *
 * @param status - Optional status filter
 * @returns Array of agent records
 */
export const getAllAgents = (status?: AgentStatusType): AgentRecord[] => {
  // ⚡ Bolt Optimization: Avoid O(N) memory allocation from spreading Map values and filtering
  if (!status) return [...agents.values()];

  const result: AgentRecord[] = [];
  for (const agent of agents.values()) {
    if (agent.status === status) {
      result.push(agent);
    }
  }
  return result;
};

/**
 * Clean up expired challenges and agents.
 * Useful for periodic maintenance or testing.
 */
export const cleanupExpired = (): void => {
  cleanupExpiredChallenges();

  const now = Date.now();
  for (const [_did, record] of agents.entries()) {
    if (record.expiresAt && now > record.expiresAt) {
      record.status = 'expired';
      record.expiresAt = now;
    }
  }
};

/**
 * Clear all state (challenges and agent records).
 * Useful for testing.
 */
export const clearState = (): void => {
  challenges.clear();
  agents.clear();
};
