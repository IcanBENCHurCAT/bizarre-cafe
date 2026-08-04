/**
 * Circuit Breaker Middleware
 *
 * Prevents cascading failures by circuit-breaking calls to upstream services.
 * States: CLOSED (normal), OPEN (failing), HALF_OPEN (testing recovery)
 */

import { Context, MiddlewareHandler } from 'hono';

export type CircuitState = 'closed' | 'open' | 'half_open';

interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeout?: number; // ms
  halfOpenMaxCalls?: number;
}

class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenCalls = 0;

  constructor(
    private failureThreshold: number = 5,
    private resetTimeout: number = 30000,
    private halfOpenMaxCalls: number = 3,
  ) {}

  getState(): CircuitState {
    return this.state;
  }

  canExecute(): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'half_open';
        this.halfOpenCalls = 0;
        return true;
      }
      return false;
    }
    // half_open
    if (this.halfOpenCalls < this.halfOpenMaxCalls) {
      this.halfOpenCalls++;
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    if (this.state === 'half_open') {
      this.state = 'closed';
    }
    this.failureCount = 0;
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
    }
  }
}

const breakers = new Map<string, CircuitBreaker>();

export function circuitBreaker(
  serviceName?: string,
  opts?: CircuitBreakerOptions,
): MiddlewareHandler {
  const breaker =
    breakers.get(serviceName!) ??
    new CircuitBreaker(opts?.failureThreshold, opts?.resetTimeout, opts?.halfOpenMaxCalls);

  if (serviceName) breakers.set(serviceName, breaker);

  return async (c: Context, next: MiddlewareHandler) => {
    const key = serviceName ?? c.req.path;

    if (!breaker.canExecute()) {
      return c.json(
        {
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: `${key} circuit breaker is open. Service is temporarily unavailable.`,
            state: breaker.getState(),
          },
        },
        503,
        { 'Retry-After': '30' },
      );
    }

    try {
      const response = await next();
      breaker.recordSuccess();
      return response;
    } catch (err) {
      breaker.recordFailure();
      throw err;
    }
  };
}
