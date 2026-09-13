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

  describe('Cryptographic DID Verification & Session JWT Issuance', () => {
    it('should verify real Ed25519 keypair and issue a signed session JWT', async () => {
      const { generateTestDidKeyPair } = await import('../src/services/identity/did');
      const { jwtVerify } = await import('jose');
      const { config } = await import('../src/config');
      const ed = await import('@noble/ed25519');

      const keypair = await generateTestDidKeyPair();
      const challenge = await challengeAgent(keypair.did);

      // Agent signs canonical challenge message
      const signatureBytes = ed.sign(new TextEncoder().encode(challenge.message), keypair.privateKey);

      const result = await verifyAgent(keypair.did, Buffer.from(signatureBytes).toString('hex'), challenge.nonce);

      expect(result.verified).toBe(true);
      expect(result.did).toBe(keypair.did);
      expect(result.verifiedAt).toBeDefined();
      expect(result.token).toBeDefined();

      // Verify the issued JWT
      const secret = new TextEncoder().encode(config.jwtSecret);
      const { payload } = await jwtVerify(result.token!, secret);
      expect(payload.sub).toBe(keypair.did);
      expect(payload.agentId).toBe(keypair.did);
      expect(payload.tier).toBe('basic');
    });

    it('should reject tampered signature with real Ed25519 DID', async () => {
      const { generateTestDidKeyPair } = await import('../src/services/identity/did');
      const ed = await import('@noble/ed25519');

      const keypair = await generateTestDidKeyPair();
      const challenge = await challengeAgent(keypair.did);

      const signatureBytes = ed.sign(new TextEncoder().encode(challenge.message), keypair.privateKey);
      signatureBytes[0] ^= 0xff; // Tamper

      const result = await verifyAgent(keypair.did, Buffer.from(signatureBytes).toString('hex'), challenge.nonce);
      expect(result.verified).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.token).toBeUndefined();
    });

    it('should prevent replay by removing the challenge upon successful verification', async () => {
      const { generateTestDidKeyPair } = await import('../src/services/identity/did');
      const ed = await import('@noble/ed25519');

      const keypair = await generateTestDidKeyPair();
      const challenge = await challengeAgent(keypair.did);

      const signatureBytes = ed.sign(new TextEncoder().encode(challenge.message), keypair.privateKey);
      const sigHex = Buffer.from(signatureBytes).toString('hex');

      // First verification succeeds
      const firstResult = await verifyAgent(keypair.did, sigHex, challenge.nonce);
      expect(firstResult.verified).toBe(true);

      // Replay attempt fails because challenge was removed
      const replayResult = await verifyAgent(keypair.did, sigHex, challenge.nonce);
      expect(replayResult.verified).toBe(false);
      expect(replayResult.reason).toContain('No valid challenge found');
    });
  });

  describe('Database Persistence & Key Management (US4)', () => {
    it('should persist verification record and status in SQLite', async () => {
      const { upsertSqliteVerification, getSqliteVerification } = await import('../src/db/sqlite');
      const testAgentId = 'did:key:z6MkTestPersistenceAgent12345';

      const record = await upsertSqliteVerification({
        user_id: testAgentId,
        is_verified: true,
        status: 'verified',
        tier: 'basic',
        method: 'ed25519_did_key',
        did_document: JSON.stringify({ id: testAgentId }),
        wallet_address: 'ALGO:TEST_WALLET_123',
        verified_at: new Date().toISOString(),
      });

      expect(record).toBeDefined();
      expect(record.user_id).toBe(testAgentId);
      expect(record.is_verified).toBe(true);
      expect(record.tier).toBe('basic');

      const fetched = await getSqliteVerification(testAgentId);
      expect(fetched).toBeDefined();
      expect(fetched?.user_id).toBe(testAgentId);
      expect(fetched?.is_verified).toBe(true);
      expect(fetched?.wallet_address).toBe('ALGO:TEST_WALLET_123');
      expect(fetched?.did_document).toContain(testAgentId);
    });

    it('should persist revocation in SQLite', async () => {
      const { upsertSqliteVerification, getSqliteVerification } = await import('../src/db/sqlite');
      const testAgentId = 'did:key:z6MkTestRevocationAgent12345';

      // First verify
      await upsertSqliteVerification({
        user_id: testAgentId,
        is_verified: true,
        status: 'verified',
        tier: 'basic',
      });

      // Now revoke
      const revoked = await upsertSqliteVerification({
        user_id: testAgentId,
        is_verified: false,
        status: 'revoked',
        tier: 'unverified',
        did_document: null,
        wallet_address: null,
        verified_at: null,
      });

      expect(revoked.is_verified).toBe(false);
      expect(revoked.status).toBe('revoked');
      expect(revoked.tier).toBe('unverified');

      const fetched = await getSqliteVerification(testAgentId);
      expect(fetched?.is_verified).toBe(false);
      expect(fetched?.status).toBe('revoked');
    });
  });
});
