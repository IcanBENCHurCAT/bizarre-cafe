import { describe, it, expect, beforeEach, vi } from 'vitest';

const { tables, mockSupabase } = vi.hoisted(() => {
  const tables: Record<string, any[]> = {
    verification_challenges: [],
    agent_verification: [],
  };

  class MockQueryBuilder {
    private tableName: string;
    private currentRows: any[];
    private currentData: any = null;
    private isSingle = false;

    constructor(tableName: string) {
      this.tableName = tableName;
      if (!tables[tableName]) {
        tables[tableName] = [];
      }
      this.currentRows = [...tables[tableName]];
    }

    select(_fields = '*') {
      if (!this.currentData) {
        this.currentData = this.currentRows;
      }
      return this;
    }

    insert(data: any) {
      const toInsert = Array.isArray(data) ? data : [data];
      tables[this.tableName].push(...toInsert);
      this.currentRows.push(...toInsert);
      this.currentData = data;
      return this;
    }

    update(updates: any) {
      for (const row of this.currentRows) {
        Object.assign(row, updates);
      }
      for (const row of tables[this.tableName]) {
        const match = this.currentRows.find((r) => r.id && r.id === row.id);
        if (match) {
          Object.assign(row, updates);
        }
      }
      this.currentData = this.currentRows;
      return this;
    }

    eq(col: string, val: any) {
      this.currentRows = this.currentRows.filter((r) => r[col] === val);
      this.currentData = this.currentRows;
      return this;
    }

    gte(col: string, val: any) {
      this.currentRows = this.currentRows.filter((r) => r[col] >= val);
      this.currentData = this.currentRows;
      return this;
    }

    single() {
      this.isSingle = true;
      return this;
    }

    then(resolve: (val: any) => any, reject?: (err: any) => any) {
      let result = this.currentData ?? this.currentRows;
      if (this.isSingle) {
        result = Array.isArray(result) ? (result[0] ?? null) : result;
      }
      return Promise.resolve({ data: result, error: null }).then(resolve, reject);
    }
  }

  const mockSupabase = {
    from: (tableName: string) => new MockQueryBuilder(tableName),
  };

  return { tables, mockSupabase };
});

vi.mock('../src/supabase/client', () => ({
  createSupabaseClient: () => mockSupabase,
  supabase: mockSupabase,
  supabaseAdmin: mockSupabase,
}));

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
    tables.verification_challenges = [];
    tables.agent_verification = [];
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
      const token = result.token ?? '';

      // Verify the issued JWT
      const secret = new TextEncoder().encode(config.jwtSecret);
      const { payload } = await jwtVerify(token, secret);
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

  describe('Production Route Signature Verification (/verify)', () => {
    it('should reject shape-only ALGO signatures in NODE_ENV=production with HTTP 400 INVALID_SIGNATURE', async () => {
      const { default: router } = await import('../src/routes/verification');
      const { createSqliteChallenge } = await import('../src/db/sqlite');
      const { config } = await import('../src/config');

      const testAgent = 'test-agent-production-check';
      const challenge = await challengeAgent(testAgent);

      // Record challenge in SQLite so /verify finds it
      await createSqliteChallenge({
        id: challenge.challengeId,
        user_id: testAgent,
        challenge: challenge.nonce,
        proof: challenge.message,
        expires_at: new Date(challenge.expiresAt).toISOString(),
        status: 'pending',
      });

      tables.verification_challenges.push({
        id: challenge.challengeId,
        user_id: testAgent,
        challenge: challenge.nonce,
        proof: challenge.message,
        expires_at: new Date(challenge.expiresAt).toISOString(),
        status: 'pending',
      });

      const originalEnv = config.nodeEnv;
      try {
        config.nodeEnv = 'production';

        const dummySignature = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        const res = await router.request('/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: testAgent,
            challenge: challenge.nonce,
            signature: dummySignature,
            walletAddress: 'ALGO:TEST_WALLET_ADDRESS_PROD',
          }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBeDefined();
        expect(body.error.code).toBe('INVALID_SIGNATURE');
      } finally {
        config.nodeEnv = originalEnv;
      }
    });
  });

  describe('Ed25519 verifySignature unit tests', () => {
    it('should verify valid Algorand Ed25519 base64 signature using algosdk even in production mode', async () => {
      const { verifySignature } = await import('../src/routes/verification');
      const { config } = await import('../src/config');
      const algosdk = await import('algosdk');

      const originalEnv = config.nodeEnv;
      try {
        config.nodeEnv = 'production';

        const account = algosdk.generateAccount();
        const walletAddress = `ALGO:${account.addr.toString()}`;
        const message = 'bizarre-cafe-verification-challenge-nonce-12345';
        const msgBytes = new TextEncoder().encode(message);

        const sigBytes = algosdk.signBytes(msgBytes, account.sk);
        const base64Sig = Buffer.from(sigBytes).toString('base64');

        const isValid = verifySignature(message, base64Sig, walletAddress);
        expect(isValid).toBe(true);
      } finally {
        config.nodeEnv = originalEnv;
      }
    });

    it('should verify valid Algorand Ed25519 hex signature using algosdk', async () => {
      const { verifySignature } = await import('../src/routes/verification');
      const algosdk = await import('algosdk');

      const account = algosdk.generateAccount();
      const walletAddress = `ALGO:${account.addr.toString()}`;
      const message = 'bizarre-cafe-verification-challenge-nonce-67890';
      const msgBytes = new TextEncoder().encode(message);

      const sigBytes = algosdk.signBytes(msgBytes, account.sk);
      const hexSig = Buffer.from(sigBytes).toString('hex');

      const isValid = verifySignature(message, hexSig, walletAddress);
      expect(isValid).toBe(true);
    });

    it('should reject tampered or invalid signature', async () => {
      const { verifySignature } = await import('../src/routes/verification');
      const algosdk = await import('algosdk');

      const account = algosdk.generateAccount();
      const walletAddress = `ALGO:${account.addr.toString()}`;
      const message = 'bizarre-cafe-verification-challenge-nonce-12345';
      const msgBytes = new TextEncoder().encode(message);

      const sigBytes = algosdk.signBytes(msgBytes, account.sk);
      sigBytes[0] ^= 0xff; // Tamper signature
      const base64Sig = Buffer.from(sigBytes).toString('base64');

      const isValid = verifySignature(message, base64Sig, walletAddress);
      expect(isValid).toBe(false);
    });

    it('should reject invalid wallet address format or missing address', async () => {
      const { verifySignature } = await import('../src/routes/verification');
      const algosdk = await import('algosdk');

      const account = algosdk.generateAccount();
      const message = 'test-nonce';
      const msgBytes = new TextEncoder().encode(message);
      const sigBytes = algosdk.signBytes(msgBytes, account.sk);
      const base64Sig = Buffer.from(sigBytes).toString('base64');

      // Missing ALGO: prefix
      expect(verifySignature(message, base64Sig, account.addr.toString())).toBe(false);
      // Empty address
      expect(verifySignature(message, base64Sig, '')).toBe(false);
    });
  });
});

