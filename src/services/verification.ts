/**
 * Verification Service
 *
 * Manages agent identity verification:
 *   challenge → verify → revoke
 *
 * Uses an in-memory store for testing.
 */

import crypto from 'node:crypto';

export interface Challenge {
  id: string;
  agentId: string;
  challenge: string;
  expiresAt: number;
  createdAt: number;
}

export interface VerificationResult {
  id: string;
  agentId: string;
  verified: boolean;
  verifiedAt?: number;
}

export interface RevocationResult {
  id: string;
  revoked: boolean;
  revokedAt: number;
}

interface VerificationStore {
  challenges: Map<string, Challenge>;
  verifications: Map<string, VerificationResult>;
}

const store: VerificationStore = {
  challenges: new Map(),
  verifications: new Map(),
};

/**
 * Generate a unique ID.
 */
function generateId(length = 32): string {
  return crypto.randomBytes(length / 2).toString('hex');
}

/**
 * Issue a challenge to an agent.
 *
 * Returns a challenge object with an ID, random challenge string,
 * and expiration time.
 */
export function challenge(agentId: string, ttlSeconds = 300): Challenge {
  const id = generateId();
  const nonce = generateId(16);

  // Hash the nonce to create the challenge (deterministic)
  const challenge = crypto.createHash('sha256').update(nonce).digest('hex');

  const challengeRecord: Challenge = {
    id,
    agentId,
    challenge,
    expiresAt: Date.now() + ttlSeconds * 1000,
    createdAt: Date.now(),
  };

  store.challenges.set(id, challengeRecord);
  return challengeRecord;
}

/**
 * Verify a challenge response.
 *
 * In production, this would verify a signature against the challenge.
 * For testing, any non-empty response is considered valid if the
 * challenge hasn't expired and is associated with the correct agent.
 */
export function verify(challengeId: string, response: string): VerificationResult {
  const challengeRecord = store.challenges.get(challengeId);
  if (!challengeRecord) {
    return {
      id: challengeId,
      agentId: '',
      verified: false,
    };
  }

  // Check if challenge has expired
  if (Date.now() > challengeRecord.expiresAt) {
    store.challenges.delete(challengeId);
    return {
      id: challengeId,
      agentId: challengeRecord.agentId,
      verified: false,
    };
  }

  // In production, verify signature against challenge
  if (!response || typeof response !== 'string' || response.length === 0) {
    return {
      id: challengeId,
      agentId: challengeRecord.agentId,
      verified: false,
    };
  }

  const verification: VerificationResult = {
    id: generateId(),
    agentId: challengeRecord.agentId,
    verified: true,
    verifiedAt: Date.now(),
  };

  store.verifications.set(verification.id, verification);
  store.challenges.delete(challengeId);

  return verification;
}

/**
 * Revoke a verification.
 */
export function revoke(verificationId: string): RevocationResult {
  const verification = store.verifications.get(verificationId);
  if (!verification) {
    return {
      id: verificationId,
      revoked: false,
      revokedAt: Date.now(),
    };
  }

  verification.verified = false;
  store.verifications.delete(verificationId);

  return {
    id: verificationId,
    revoked: true,
    revokedAt: Date.now(),
  };
}

/**
 * Check if a verification is active.
 */
export function isActive(verificationId: string): boolean {
  const verification = store.verifications.get(verificationId);
  return verification?.verified ?? false;
}

/**
 * Reset the in-memory store (useful for tests).
 */
export function resetStore(): void {
  store.challenges.clear();
  store.verifications.clear();
}
