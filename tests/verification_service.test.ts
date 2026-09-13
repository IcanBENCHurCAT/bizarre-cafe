import { describe, it, expect, beforeEach } from 'vitest';
import {
  challengeAgent,
  verifyAgent,
  getAgentStatus,
  revokeAgent,
  clearState,
} from '../src/services/verification/index';
import * as legacyVerification from '../src/services/verification';

describe('Agent Verification Service', () => {
  beforeEach(() => {
    clearState();
  });

  const testDid = 'did:algo:test-agent-1234567890abcdef';

  it('should issue a challenge with unique nonce and valid expiration', async () => {
    const challenge = await challengeAgent(testDid);

    expect(challenge).toBeDefined();
    expect(challenge.did).toBe(testDid);
    expect(challenge.nonce).toHaveLength(64); // 32 bytes hex
    expect(challenge.challengeId).toBeDefined();
    expect(challenge.expiresAt).toBeGreaterThan(Date.now());
    expect(challenge.message).toContain(challenge.nonce);
    expect(challenge.message).toContain(testDid);

    const status = getAgentStatus(testDid);
    expect(status.status).toBe('challenged');
    expect(status.challengeCount).toBe(1);
  });

  it('should fail verification if challenge does not exist', async () => {
    const result = await verifyAgent(testDid, 'dummy-signature-12345678', 'unknown-nonce');
    expect(result.verified).toBe(false);
    expect(result.reason).toContain('No valid challenge found');
  });

  it('should successfully verify when a valid challenge exists', async () => {
    const challenge = await challengeAgent(testDid);
    // 64-character dummy signature for test
    const dummySignature = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    const result = await verifyAgent(testDid, dummySignature, challenge.nonce);
    expect(result.verified).toBe(true);
    expect(result.did).toBe(testDid);
    expect(result.verifiedAt).toBeDefined();

    const status = getAgentStatus(testDid);
    expect(status.status).toBe('verified');
  });

  it('should revoke verification', async () => {
    const challenge = await challengeAgent(testDid);
    const dummySignature = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    await verifyAgent(testDid, dummySignature, challenge.nonce);

    const revoked = revokeAgent(testDid);
    expect(revoked).toBe(true);

    const status = getAgentStatus(testDid);
    expect(status.status).toBe('revoked');
  });

  it('should support legacy verification exports', async () => {
    const legacyChallenge = await legacyVerification.challenge(testDid);
    expect(legacyChallenge.nonce).toBeDefined();

    const dummySignature = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const legacyResult = await legacyVerification.verify(testDid, dummySignature);
    expect(legacyResult).toBeDefined();

    legacyVerification.resetStore();
    expect(legacyVerification.isActive(testDid)).toBe(false);
  });
});
