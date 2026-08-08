/**
 * Rate Limiter Middleware
 *
 * Sliding window rate limiter that tracks requests per client IP / agent ID.
 * Fails open to avoid blocking legitimate traffic.
 */

import { Context as _Context, MiddlewareHandler } from 'hono';
import { config } from '../config';

interface RateLimiterOptions {
  windowMs?: number;
  maxRequests?: number;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiterStore {
  private store = new Map<string, RateLimitEntry>();

  get(key: string): RateLimitEntry | undefined {
    return this.store.get(key);
  }

  set(key: string, entry: RateLimitEntry): void {
    this.store.set(key, entry);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime < now) {
        this.store.delete(key);
      }
    }
  }
}

const store = new RateLimiterStore();

export const rateLimiter = (opts?: RateLimiterOptions): MiddlewareHandler => {
  const windowMs = opts?.windowMs ?? config.rateLimitWindowMs;
  const maxRequests = opts?.maxRequests ?? config.rateLimitMaxRequests;
  const _windowStart = Date.now();

  // Periodic cleanup
  setInterval(() => store.cleanup(), windowMs).unref();

  return async (c, next) => {
    const clientKey = c.req.header('x-forwarded-for') ?? c.req.header('x-agent-id') ?? c.req.url;

    const now = Date.now();
    const entry = store.get(clientKey);

    if (!entry || now >= entry.resetTime) {
      store.set(clientKey, { count: 1, resetTime: now + windowMs });
      c.header('X-RateLimit-Limit', String(maxRequests));
      c.header('X-RateLimit-Remaining', String(maxRequests - 1));
      c.header('X-RateLimit-Reset', String(Math.floor((now + windowMs) / 1000)));
      return next();
    }

    entry.count++;

    if (entry.count > maxRequests) {
      return c.json(
        { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Try again later.' } },
        429,
        {
          'Retry-After': String(Math.ceil((entry.resetTime - now) / 1000)),
        },
      );
    }

    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(maxRequests - entry.count));
    c.header('X-RateLimit-Reset', String(Math.floor(entry.resetTime / 1000)));
    return next();
  };
};
