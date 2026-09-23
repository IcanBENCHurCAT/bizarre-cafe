import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { rateLimiter } from '../src/middleware/rateLimiter';
import { config } from '../src/config';

describe('Rate Limiter Middleware', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should use default options from config when no options are provided', async () => {
    const app = new Hono();
    app.use('*', rateLimiter());
    app.get('/test', (c) => c.text('OK'));

    const res = await app.request('/test', {
      headers: { 'x-forwarded-for': '192.168.1.1' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Limit')).toBe(String(config.rateLimitMaxRequests));
    expect(res.headers.get('X-RateLimit-Remaining')).toBe(String(config.rateLimitMaxRequests - 1));
  });

  it('should override options when custom options are provided', async () => {
    const app = new Hono();
    app.use(
      '*',
      rateLimiter({
        windowMs: 60000,
        maxRequests: 5,
      }),
    );
    app.get('/test', (c) => c.text('OK'));

    const res = await app.request('/test', {
      headers: { 'x-forwarded-for': '192.168.1.2' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('5');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('4');
  });

  it('should decrement X-RateLimit-Remaining on consecutive requests within limit', async () => {
    const app = new Hono();
    app.use(
      '*',
      rateLimiter({
        windowMs: 60000,
        maxRequests: 3,
      }),
    );
    app.get('/test', (c) => c.text('OK'));

    const ip = '10.0.0.1';

    const res1 = await app.request('/test', { headers: { 'x-forwarded-for': ip } });
    expect(res1.status).toBe(200);
    expect(res1.headers.get('X-RateLimit-Remaining')).toBe('2');

    const res2 = await app.request('/test', { headers: { 'x-forwarded-for': ip } });
    expect(res2.status).toBe(200);
    expect(res2.headers.get('X-RateLimit-Remaining')).toBe('1');

    const res3 = await app.request('/test', { headers: { 'x-forwarded-for': ip } });
    expect(res3.status).toBe(200);
    expect(res3.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  it('should return 429 RATE_LIMIT_EXCEEDED when request limit is exceeded', async () => {
    const app = new Hono();
    app.use(
      '*',
      rateLimiter({
        windowMs: 60000,
        maxRequests: 2,
      }),
    );
    app.get('/test', (c) => c.text('OK'));

    const ip = '10.0.0.2';

    // Request 1
    await app.request('/test', { headers: { 'x-forwarded-for': ip } });
    // Request 2
    await app.request('/test', { headers: { 'x-forwarded-for': ip } });

    // Request 3 - Exceeds limit
    const res = await app.request('/test', { headers: { 'x-forwarded-for': ip } });
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body).toEqual({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Try again later.',
      },
    });

    expect(res.headers.has('Retry-After')).toBe(true);
    const retryAfter = Number(res.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it('should reset limit after windowMs has elapsed', async () => {
    const windowMs = 30000;
    const app = new Hono();
    app.use(
      '*',
      rateLimiter({
        windowMs,
        maxRequests: 2,
      }),
    );
    app.get('/test', (c) => c.text('OK'));

    const ip = '10.0.0.3';

    // Exhaust limit
    await app.request('/test', { headers: { 'x-forwarded-for': ip } });
    await app.request('/test', { headers: { 'x-forwarded-for': ip } });

    const blockedRes = await app.request('/test', { headers: { 'x-forwarded-for': ip } });
    expect(blockedRes.status).toBe(429);

    // Advance time beyond windowMs
    vi.advanceTimersByTime(windowMs + 100);

    // Request after window reset should succeed
    const allowedRes = await app.request('/test', { headers: { 'x-forwarded-for': ip } });
    expect(allowedRes.status).toBe(200);
    expect(allowedRes.headers.get('X-RateLimit-Remaining')).toBe('1');
  });

  it('should prioritize x-forwarded-for over x-agent-id and c.req.url', async () => {
    const app = new Hono();
    app.use(
      '*',
      rateLimiter({
        windowMs: 60000,
        maxRequests: 1,
      }),
    );
    app.get('/test', (c) => c.text('OK'));

    // First request with x-forwarded-for and x-agent-id
    const res1 = await app.request('/test', {
      headers: {
        'x-forwarded-for': '1.1.1.1',
        'x-agent-id': 'agent-a',
      },
    });
    expect(res1.status).toBe(200);

    // Same x-forwarded-for, different x-agent-id -> Should be rate limited (key was x-forwarded-for)
    const res2 = await app.request('/test', {
      headers: {
        'x-forwarded-for': '1.1.1.1',
        'x-agent-id': 'agent-b',
      },
    });
    expect(res2.status).toBe(429);

    // Different x-forwarded-for, same x-agent-id -> Should be allowed
    const res3 = await app.request('/test', {
      headers: {
        'x-forwarded-for': '2.2.2.2',
        'x-agent-id': 'agent-a',
      },
    });
    expect(res3.status).toBe(200);
  });

  it('should use x-agent-id when x-forwarded-for is missing', async () => {
    const app = new Hono();
    app.use(
      '*',
      rateLimiter({
        windowMs: 60000,
        maxRequests: 1,
      }),
    );
    app.get('/test', (c) => c.text('OK'));

    const res1 = await app.request('/test', {
      headers: { 'x-agent-id': 'agent-x' },
    });
    expect(res1.status).toBe(200);

    const res2 = await app.request('/test', {
      headers: { 'x-agent-id': 'agent-x' },
    });
    expect(res2.status).toBe(429);

    const res3 = await app.request('/test', {
      headers: { 'x-agent-id': 'agent-y' },
    });
    expect(res3.status).toBe(200);
  });

  it('should fall back to c.req.url when x-forwarded-for and x-agent-id are missing', async () => {
    const app = new Hono();
    app.use(
      '*',
      rateLimiter({
        windowMs: 60000,
        maxRequests: 1,
      }),
    );
    app.get('/endpoint-a', (c) => c.text('OK A'));
    app.get('/endpoint-b', (c) => c.text('OK B'));

    // First call to endpoint-a with no headers
    const res1 = await app.request('http://localhost/endpoint-a');
    expect(res1.status).toBe(200);

    // Second call to endpoint-a -> rate limited
    const res2 = await app.request('http://localhost/endpoint-a');
    expect(res2.status).toBe(429);

    // Call to endpoint-b -> allowed (different URL key)
    const res3 = await app.request('http://localhost/endpoint-b');
    expect(res3.status).toBe(200);
  });

  it('should maintain independent limits for different client keys', async () => {
    const app = new Hono();
    app.use(
      '*',
      rateLimiter({
        windowMs: 60000,
        maxRequests: 1,
      }),
    );
    app.get('/test', (c) => c.text('OK'));

    const resClientA = await app.request('/test', {
      headers: { 'x-forwarded-for': '10.0.0.100' },
    });
    expect(resClientA.status).toBe(200);

    const resClientABlocked = await app.request('/test', {
      headers: { 'x-forwarded-for': '10.0.0.100' },
    });
    expect(resClientABlocked.status).toBe(429);

    const resClientB = await app.request('/test', {
      headers: { 'x-forwarded-for': '10.0.0.101' },
    });
    expect(resClientB.status).toBe(200);
  });
});
