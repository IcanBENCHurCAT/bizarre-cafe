import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { SignJWT } from 'jose';
import { authMiddleware, requireX402Payment, createToken } from '../src/middleware/auth';
import { config } from '../src/config';
import {
  registerMockTransaction,
  clearMockTransactions,
  clearSpentTransactions,
  setMockVerificationMode,
} from '../src/services/x402/index';
import { clearSqlitePayments } from '../src/db/sqlite';

describe('Auth Middleware Security Tests', () => {
  let originalEnv: typeof config.nodeEnv;

  beforeEach(() => {
    originalEnv = config.nodeEnv;
  });

  afterEach(() => {
    config.nodeEnv = originalEnv;
  });

  it('should reject X-Agent-ID header authentication bypass in production environment', async () => {
    config.nodeEnv = 'production';
    const app = new Hono();
    app.use('/test', authMiddleware);
    app.get('/test', (c) => {
      if (!c.auth.user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
      return c.json({ auth: c.auth });
    });

    const res = await app.request('/test', {
      headers: {
        'X-Agent-ID': 'attacker-agent',
      },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('should allow X-Agent-ID header authentication in development environment', async () => {
    config.nodeEnv = 'development';
    const app = new Hono();
    app.use('/test', authMiddleware);
    app.get('/test', (c) => {
      if (!c.auth.user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
      return c.json({ auth: c.auth });
    });

    const res = await app.request('/test', {
      headers: {
        'X-Agent-ID': 'dev-agent-123',
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.auth.user).toBeDefined();
    expect(body.auth.user.agentId).toBe('dev-agent-123');
  });

  it('should authenticate via valid Bearer JWT token in production', async () => {
    config.nodeEnv = 'production';
    const app = new Hono();
    app.use('/test', authMiddleware);
    app.get('/test', (c) => {
      if (!c.auth.user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
      return c.json({ auth: c.auth });
    });

    const token = await createToken({
      agentId: 'authed-agent',
      tier: 'premium',
      paidRoutes: ['/api/shop/*'],
    });

    const res = await app.request('/test', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.auth.user).toBeDefined();
    expect(body.auth.user.agentId).toBe('authed-agent');
    expect(body.auth.user.tier).toBe('premium');
    expect(body.auth.user.paidRoutes).toEqual(['/api/shop/*']);
  });

  it('should reject invalid or fake Bearer token in production', async () => {
    config.nodeEnv = 'production';
    const app = new Hono();
    app.use('/test', authMiddleware);
    app.get('/test', (c) => {
      if (!c.auth.user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
      return c.json({ auth: c.auth });
    });

    const res = await app.request('/test', {
      headers: {
        Authorization: 'Bearer invalid-fake-token',
      },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('should reject Bearer token signed with wrong secret in production', async () => {
    config.nodeEnv = 'production';
    const app = new Hono();
    app.use('/test', authMiddleware);
    app.get('/test', (c) => {
      if (!c.auth.user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
      return c.json({ auth: c.auth });
    });

    const wrongSecret = new TextEncoder().encode('wrong-secret-key-1234567890');
    const tokenSignedWithWrongSecret = await new SignJWT({ agentId: 'malicious-user' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(wrongSecret);

    const res = await app.request('/test', {
      headers: {
        Authorization: `Bearer ${tokenSignedWithWrongSecret}`,
      },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('should authenticate via valid X-Agent-DID, X-Agent-Signature, and X-Agent-Nonce in production', async () => {
    const { generateTestDidKeyPair } = await import('../src/services/identity/did');
    const ed = await import('@noble/ed25519');

    config.nodeEnv = 'production';
    const app = new Hono();
    app.use('/test', authMiddleware);
    app.get('/test', (c) => {
      if (!c.auth.user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
      return c.json({ auth: c.auth });
    });

    const keypair = await generateTestDidKeyPair();
    const nonce = 'stateless-auth-nonce-999888';
    const sigBytes = ed.sign(new TextEncoder().encode(nonce), keypair.privateKey);
    const sigHex = Buffer.from(sigBytes).toString('hex');

    const res = await app.request('/test', {
      headers: {
        'X-Agent-DID': keypair.did,
        'X-Agent-Signature': sigHex,
        'X-Agent-Nonce': nonce,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.auth.user).toBeDefined();
    expect(body.auth.user.agentId).toBe(keypair.did);
  });

  it('should reject invalid X-Agent-Signature with X-Agent-DID in production', async () => {
    const { generateTestDidKeyPair } = await import('../src/services/identity/did');
    const ed = await import('@noble/ed25519');

    config.nodeEnv = 'production';
    const app = new Hono();
    app.use('/test', authMiddleware);
    app.get('/test', (c) => {
      if (!c.auth.user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
      return c.json({ auth: c.auth });
    });

    const keypair = await generateTestDidKeyPair();
    const nonce = 'stateless-auth-nonce-999888';
    const sigBytes = ed.sign(new TextEncoder().encode(nonce), keypair.privateKey);
    sigBytes[0] ^= 0xff; // Tamper signature
    const sigHex = Buffer.from(sigBytes).toString('hex');

    const res = await app.request('/test', {
      headers: {
        'X-Agent-DID': keypair.did,
        'X-Agent-Signature': sigHex,
        'X-Agent-Nonce': nonce,
      },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  describe('requireX402Payment Middleware', () => {
    const validTxId = 'VALID_AUTH_TX_1234567890ABCDEFGH';

    beforeEach(async () => {
      clearSpentTransactions();
      clearMockTransactions();
      setMockVerificationMode(true);
      await clearSqlitePayments();
    });

    it('should return 402 with structured challenge when payment header is absent', async () => {
      const app = new Hono();
      app.use('/paid', requireX402Payment({ minAmountMicroAlgos: 150000 }));
      app.get('/paid', (c) => c.json({ success: true }));

      const res = await app.request('/paid');
      expect(res.status).toBe(402);

      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('PAYMENT_REQUIRED');
      expect(body.error.message).toBe('x402 payment required for this endpoint');
      expect(body.error.challenge).toBeDefined();
      expect(typeof body.error.challenge.paymentId).toBe('string');
      expect(body.error.challenge.paymentId.length).toBeGreaterThan(0);
      expect(body.error.challenge.receiverWallet).toBe(config.algorandReceiverWallet);
      expect(body.error.challenge.amount).toBe(150000);
      expect(body.error.challenge.currency).toBe('microAlgos');
      expect(body.error.challenge.network).toBe(config.algorandNetwork || 'algorand-testnet');
      expect(body.error.challenge.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should return 402 when invalid/unknown txId or fake header is sent', async () => {
      const app = new Hono();
      app.use('/paid', requireX402Payment());
      app.get('/paid', (c) => c.json({ success: true }));

      const res = await app.request('/paid', {
        headers: {
          'x-x402-payment': 'notfound_tx_9999999999999999',
        },
      });

      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('PAYMENT_VERIFICATION_FAILED');
      expect(body.error.txId).toBe('notfound_tx_9999999999999999');
    });

    it('should return 200 when valid registered mock txId is sent', async () => {
      registerMockTransaction({
        txId: validTxId,
        sender: 'ALGO_TEST_SENDER_WALLET',
        receiver: config.algorandReceiverWallet,
        amount: 200000,
        confirmedRound: 100,
      });

      const app = new Hono();
      app.use('/paid', requireX402Payment({ minAmountMicroAlgos: 100000 }));
      app.get('/paid', (c) => c.json({ success: true, receipt: c.get('x402Receipt') }));

      const res = await app.request('/paid', {
        headers: {
          'x-x402-payment': validTxId,
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.receipt).toBeDefined();
      expect(body.receipt.txId).toBe(validTxId);
    });

    it('should return 402 DOUBLE_SPEND_DETECTED when identical txId is replayed', async () => {
      registerMockTransaction({
        txId: validTxId,
        sender: 'ALGO_TEST_SENDER_WALLET',
        receiver: config.algorandReceiverWallet,
        amount: 200000,
        confirmedRound: 100,
      });

      const app = new Hono();
      app.use('/paid', requireX402Payment({ minAmountMicroAlgos: 100000 }));
      app.get('/paid', (c) => c.json({ success: true }));

      // First request succeeds
      const firstRes = await app.request('/paid', {
        headers: {
          'x-x402-payment': validTxId,
        },
      });
      expect(firstRes.status).toBe(200);

      // Replay request fails with DOUBLE_SPEND_DETECTED
      const replayRes = await app.request('/paid', {
        headers: {
          'x-x402-payment': validTxId,
        },
      });
      expect(replayRes.status).toBe(402);
      const body = await replayRes.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('DOUBLE_SPEND_DETECTED');
      expect(body.error.txId).toBe(validTxId);
    });
  });
});
