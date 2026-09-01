import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware, requireX402Payment } from '../src/middleware/auth';
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

  it('should authenticate via Bearer token in production', async () => {
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
        Authorization: 'Bearer valid-token',
        'X-Agent-ID': 'authed-agent',
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.auth.user).toBeDefined();
    expect(body.auth.user.agentId).toBe('authed-agent');
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
