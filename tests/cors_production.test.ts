import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { parseCorsOrigins } from '../src/config';

describe('Strict Production CORS and Origin Validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('Configuration validation in production', () => {
    it('should throw an error when CORS_ALLOWED_ORIGINS is wildcard (*) in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.CORS_ALLOWED_ORIGINS = '*';
      process.env.JWT_SECRET = 'test-secret';

      expect(() => {
        parseCorsOrigins('production', '*');
      }).toThrow("In production environment, CORS_ALLOWED_ORIGINS must be explicitly specified and cannot be wildcard '*'");

      await expect(async () => {
        await import('../src/config.ts');
      }).rejects.toThrow("In production environment, CORS_ALLOWED_ORIGINS must be explicitly specified and cannot be wildcard '*'");
    });

    it('should throw an error when CORS_ALLOWED_ORIGINS is missing or empty in production', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.CORS_ALLOWED_ORIGINS;
      process.env.JWT_SECRET = 'test-secret';

      expect(() => {
        parseCorsOrigins('production', '');
      }).toThrow("In production environment, CORS_ALLOWED_ORIGINS must be explicitly specified and cannot be wildcard '*'");

      await expect(async () => {
        await import('../src/config.ts');
      }).rejects.toThrow("In production environment, CORS_ALLOWED_ORIGINS must be explicitly specified and cannot be wildcard '*'");
    });

    it('should parse single and comma-separated origins correctly in production', () => {
      const single = parseCorsOrigins('production', 'https://bizarre.cafe');
      expect(single).toEqual(['https://bizarre.cafe']);

      const multi = parseCorsOrigins(
        'production',
        'https://bizarre.cafe, https://app.bizarre.cafe',
      );
      expect(multi).toEqual(['https://bizarre.cafe', 'https://app.bizarre.cafe']);
    });

    it('should allow wildcard origin in non-production environments', () => {
      const dev = parseCorsOrigins('development', '*');
      expect(dev).toBe('*');

      const testEnv = parseCorsOrigins('test');
      expect(testEnv).toBe('*');
    });
  });

  describe('CORS middleware execution in production mode', () => {
    const allowedOrigins = ['https://bizarre.cafe', 'https://app.bizarre.cafe'];

    const createTestApp = (origins: string | string[]) => {
      const app = new Hono();
      app.use(
        '*',
        cors({
          origin: origins,
          allowHeaders: [
            'Authorization',
            'Content-Type',
            'X-Agent-ID',
            'x-agent-id',
            'X-Agent-DID',
            'x-agent-did',
            'X-Agent-Signature',
            'x-agent-signature',
            'X-Agent-Nonce',
            'x-agent-nonce',
            'X-Agent-Timestamp',
            'x-agent-timestamp',
            'X-Room-ID',
            'x-room-id',
            'X-402-Payment',
            'x-x402-payment',
            'X-402-Receipt',
            'x-402-receipt',
            'X-Wallet-Sig',
            'X-Wallet-Address',
            'X-Wallet-Message',
          ],
          allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
          exposeHeaders: ['Content-Length', 'X-Response-Time', 'X-402-Payment-Required'],
          credentials: true,
        }),
      );

      app.get('/api/test', (c) => c.json({ ok: true }));
      app.post('/api/chat/messages', (c) => c.json({ message: 'sent' }));
      return app;
    };

    it('should allow requests from whitelisted origins and set credentials header', async () => {
      const app = createTestApp(allowedOrigins);

      const res = await app.request('/api/test', {
        headers: { Origin: 'https://app.bizarre.cafe' },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.bizarre.cafe');
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });

    it('should reject requests from disallowed origins in production', async () => {
      const app = createTestApp(allowedOrigins);

      const res = await app.request('/api/test', {
        headers: { Origin: 'https://evil.attacker.com' },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('should properly respond to preflight OPTIONS request with allowed methods and headers', async () => {
      const app = createTestApp(allowedOrigins);

      const res = await app.request('/api/chat/messages', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://bizarre.cafe',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, X-Agent-DID, X-402-Payment',
        },
      });

      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://bizarre.cafe');
      expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(res.headers.get('Access-Control-Allow-Headers')).toContain('X-Agent-DID');
      expect(res.headers.get('Access-Control-Expose-Headers')).toContain('X-402-Payment-Required');
    });
  });
});
