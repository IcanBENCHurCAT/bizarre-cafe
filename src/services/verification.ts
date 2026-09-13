/**
 * Verification Service
 *
 * Re-exports the unified Agent Verification Service from ./verification/index.
 */

export * from './verification/index';

// Compatibility aliases for legacy consumers
import {
  challengeAgent,
  verifyAgent,
  revokeAgent,
  getAgentStatus,
  clearState,
  type Challenge,
  type VerificationResult,
} from './verification/index';

export function challenge(agentId: string, _ttlSeconds = 300): Promise<Challenge> {
  return challengeAgent(agentId);
}

export function verify(challengeId: string, response: string): Promise<VerificationResult> {
  return verifyAgent(challengeId, response, challengeId);
}

export function revoke(agentId: string): boolean {
  return revokeAgent(agentId);
}

export function isActive(agentId: string): boolean {
  return getAgentStatus(agentId).status === 'verified';
}

export function resetStore(): void {
  clearState();
}

