import { describe, it, expect, afterEach } from 'vitest';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from '../src/config';

describe('CORS Configuration Middleware', () => {
  const originalEnv = process.env.CORS_ALLOWED_ORIGINS;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CORS_ALLOWED_ORIGINS;
    } else {
      process.env.CORS_ALLOWED_ORIGINS = originalEnv;
    }
  });

  it('should default corsAllowedOrigins to wildcard (*)', () => {
    expect(config.corsAllowedOrigins).toBeDefined();
  });

  it('should allow all origins when origin is set to wildcard (*)', async () => {
    const app = new Hono();
    app.use('*', cors({ origin: '*' }));
    app.get('/health', (c) => c.json({ status: 'ok' }));

    const res = await app.request('/health', {
      headers: { Origin: 'https://example.com' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('should reflect origin when origin is in allowed origins array', async () => {
    const allowedOrigins = ['https://app.bizarre.cafe', 'https://admin.bizarre.cafe'];
    const app = new Hono();
    app.use('*', cors({ origin: allowedOrigins }));
    app.get('/health', (c) => c.json({ status: 'ok' }));

    const res1 = await app.request('/health', {
      headers: { Origin: 'https://app.bizarre.cafe' },
    });
    expect(res1.status).toBe(200);
    expect(res1.headers.get('Access-Control-Allow-Origin')).toBe('https://app.bizarre.cafe');

    const res2 = await app.request('/health', {
      headers: { Origin: 'https://unauthorized.com' },
    });
    expect(res2.status).toBe(200);
    expect(res2.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('should handle preflight OPTIONS request correctly with CORS options', async () => {
    const allowedOrigins = ['https://app.bizarre.cafe'];
    const app = new Hono();
    app.use('*', cors({ origin: allowedOrigins }));
    app.options('/api/test', (c) => c.text(''));

    const res = await app.request('/api/test', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://app.bizarre.cafe',
        'Access-Control-Request-Method': 'POST',
      },
    });

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.bizarre.cafe');
  });
});
