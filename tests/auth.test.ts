import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { SignJWT } from 'jose';
import { authMiddleware, requireX402Payment, createToken } from '../src/middleware/auth';
import { config } from '../src/config';

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

  it('should handle requireX402Payment middleware', async () => {
    const app = new Hono();
    app.use('/paid', requireX402Payment());
    app.get('/paid', (c) => c.json({ success: true }));

    const resNoPayment = await app.request('/paid');
    expect(resNoPayment.status).toBe(402);

    const resWithPayment = await app.request('/paid', {
      headers: {
        'x-x402-payment': 'receipt-123',
      },
    });
    expect(resWithPayment.status).toBe(200);
  });
});
