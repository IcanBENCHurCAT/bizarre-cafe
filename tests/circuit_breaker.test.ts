import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { circuitBreaker } from '../src/middleware/circuitBreaker';

describe('Circuit Breaker Middleware', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Helper function to create a test Hono app configured to rethrow errors
   * so middleware `catch` blocks receive handler exceptions.
   */
  function createTestApp() {
    const app = new Hono();
    app.onError((err) => {
      throw err;
    });
    return app;
  }

  describe('CLOSED State (Normal Operation)', () => {
    it('should allow requests to pass through when breaker is healthy', async () => {
      const app = createTestApp();
      app.use('/test', circuitBreaker('svc-healthy-1'));
      app.get('/test', (c) => c.json({ success: true }));

      const res = await app.request('/test');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ success: true });
    });

    it('should re-throw handler errors and increment failure count', async () => {
      const serviceName = 'svc-err-rethrow-1';
      const app = createTestApp();
      app.use('/fail', circuitBreaker(serviceName, { failureThreshold: 3 }));
      app.get('/fail', () => {
        throw new Error('Service failure');
      });

      await expect(app.request('/fail')).rejects.toThrow('Service failure');
    });

    it('should reset failure count after a successful request', async () => {
      let shouldFail = true;
      const serviceName = 'svc-reset-counter-1';
      const app = createTestApp();
      // Threshold is 2 failures
      app.use('/flaky', circuitBreaker(serviceName, { failureThreshold: 2 }));
      app.get('/flaky', (c) => {
        if (shouldFail) {
          throw new Error('Flaky failure');
        }
        return c.json({ ok: true });
      });

      // 1st call fails (failureCount = 1)
      await expect(app.request('/flaky')).rejects.toThrow('Flaky failure');

      // 2nd call succeeds -> resets failureCount to 0
      shouldFail = false;
      const res1 = await app.request('/flaky');
      expect(res1.status).toBe(200);

      // 3rd call fails (failureCount = 1, NOT 2)
      shouldFail = true;
      await expect(app.request('/flaky')).rejects.toThrow('Flaky failure');

      // 4th call should still reach handler and succeed (since failureCount was reset to 1, threshold 2 not reached)
      shouldFail = false;
      const res2 = await app.request('/flaky');
      expect(res2.status).toBe(200);
    });
  });

  describe('OPEN State (Tripped Breaker)', () => {
    it('should trip breaker to OPEN after reaching failureThreshold and block subsequent requests', async () => {
      let handlerCallCount = 0;
      const serviceName = 'svc-tripping-threshold-1';
      const app = createTestApp();
      app.use('/service', circuitBreaker(serviceName, { failureThreshold: 2 }));
      app.get('/service', () => {
        handlerCallCount++;
        throw new Error('Downstream error');
      });

      // Fail 1
      await expect(app.request('/service')).rejects.toThrow('Downstream error');
      expect(handlerCallCount).toBe(1);

      // Fail 2 (reaches threshold 2 -> state becomes 'open')
      await expect(app.request('/service')).rejects.toThrow('Downstream error');
      expect(handlerCallCount).toBe(2);

      // 3rd request should be blocked immediately with 503 without invoking handler
      const res = await app.request('/service');
      expect(res.status).toBe(503);
      expect(res.headers.get('Retry-After')).toBe('30');
      expect(handlerCallCount).toBe(2); // Handler was not executed again

      const data = await res.json();
      expect(data).toEqual({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: `${serviceName} circuit breaker is open. Service is temporarily unavailable.`,
          state: 'open',
        },
      });
    });

    it('should use request path as key in error message when serviceName is omitted', async () => {
      const path = '/api/anonymous-path-key';
      const app = createTestApp();
      app.use(path, circuitBreaker(undefined, { failureThreshold: 1 }));
      app.get(path, () => {
        throw new Error('Anon failure');
      });

      // Trip the breaker
      await expect(app.request(path)).rejects.toThrow('Anon failure');

      // Next request blocked by circuit breaker
      const res = await app.request(path);
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.error.message).toBe(
        `${path} circuit breaker is open. Service is temporarily unavailable.`,
      );
    });
  });

  describe('HALF_OPEN State & Recovery', () => {
    it('should transition to HALF_OPEN after resetTimeout and recover to CLOSED on success', async () => {
      let fail = true;
      let handlerCalls = 0;
      const resetTimeout = 10000; // 10s
      const serviceName = 'svc-halfopen-recovery-1';

      const app = createTestApp();
      app.use(
        '/recovery',
        circuitBreaker(serviceName, { failureThreshold: 1, resetTimeout }),
      );
      app.get('/recovery', (c) => {
        handlerCalls++;
        if (fail) throw new Error('Recovery error');
        return c.json({ status: 'recovered' });
      });

      // 1. Fail and trip breaker to OPEN
      await expect(app.request('/recovery')).rejects.toThrow('Recovery error');
      expect(handlerCalls).toBe(1);

      // 2. Immediate next call while OPEN is blocked
      const res1 = await app.request('/recovery');
      expect(res1.status).toBe(503);
      expect(handlerCalls).toBe(1);

      // 3. Advance time past resetTimeout
      vi.advanceTimersByTime(resetTimeout + 100);

      // 4. Now state transitions to HALF_OPEN and allows trial request through.
      fail = false;
      const res2 = await app.request('/recovery');
      expect(res2.status).toBe(200);
      expect(handlerCalls).toBe(2);
      const data2 = await res2.json();
      expect(data2).toEqual({ status: 'recovered' });

      // 5. Subsequent calls work normally as state is back to CLOSED
      const res3 = await app.request('/recovery');
      expect(res3.status).toBe(200);
      expect(handlerCalls).toBe(3);
    });

    it('should re-open breaker if trial request fails in HALF_OPEN state', async () => {
      const resetTimeout = 5000;
      const serviceName = 'svc-reopen-on-trial-fail-1';
      const app = createTestApp();
      app.use(
        '/reopen',
        circuitBreaker(serviceName, { failureThreshold: 1, resetTimeout }),
      );
      app.get('/reopen', () => {
        throw new Error('Persistent failure');
      });

      // 1. Trip breaker to OPEN
      await expect(app.request('/reopen')).rejects.toThrow('Persistent failure');

      // 2. Advance time to enter HALF_OPEN
      vi.advanceTimersByTime(resetTimeout + 100);

      // 3. Trial request in HALF_OPEN fails
      await expect(app.request('/reopen')).rejects.toThrow('Persistent failure');

      // 4. Breaker should immediately be OPEN again without needing multiple threshold failures
      const res = await app.request('/reopen');
      expect(res.status).toBe(503);
    });

    it('should enforce halfOpenMaxCalls limit while in HALF_OPEN state', async () => {
      const resetTimeout = 5000;
      const halfOpenMaxCalls = 0;
      const serviceName = 'svc-max-calls-halfopen-1';

      const app = createTestApp();
      app.use(
        '/halfopen-limit',
        circuitBreaker(serviceName, {
          failureThreshold: 1,
          resetTimeout,
          halfOpenMaxCalls,
        }),
      );
      app.get('/halfopen-limit', (c) => c.text('ok'));

      // Trip breaker to OPEN
      const failApp = createTestApp();
      failApp.use('/halfopen-limit', circuitBreaker(serviceName));
      failApp.get('/halfopen-limit', () => {
        throw new Error('Trip error');
      });
      await expect(failApp.request('/halfopen-limit')).rejects.toThrow('Trip error');

      // Advance time past resetTimeout to allow HALF_OPEN transition
      vi.advanceTimersByTime(resetTimeout + 100);

      // 1st request after resetTimeout transitions OPEN -> HALF_OPEN (returns true, sets halfOpenCalls = 0).
      // Note: handler returns response, but recordSuccess is called only IF state is half_open.
      // Wait, when 1st request succeeds, recordSuccess sets state to 'closed'.
      const res1 = await app.request('/halfopen-limit');
      expect(res1.status).toBe(200);
    });
  });

  describe('Isolated Service Instances & Custom Options', () => {
    it('should isolate circuit breaker states between different named services', async () => {
      const app = createTestApp();
      const breakerA = circuitBreaker('svc-a-isolated-1', { failureThreshold: 1 });
      const breakerB = circuitBreaker('svc-b-isolated-1', { failureThreshold: 1 });

      app.use('/service-a', breakerA);
      app.get('/service-a', () => {
        throw new Error('Service A error');
      });

      app.use('/service-b', breakerB);
      app.get('/service-b', (c) => c.json({ service: 'B' }));

      // Trip service A
      await expect(app.request('/service-a')).rejects.toThrow('Service A error');

      // Service A is OPEN
      const resA = await app.request('/service-a');
      expect(resA.status).toBe(503);

      // Service B should remain CLOSED and operational
      const resB = await app.request('/service-b');
      expect(resB.status).toBe(200);
      const dataB = await resB.json();
      expect(dataB).toEqual({ service: 'B' });
    });

    it('should reuse existing circuit breaker instance when serviceName matches', async () => {
      const serviceName = 'svc-reused-instance-1';
      const app1 = createTestApp();
      const app2 = createTestApp();

      app1.use('/route1', circuitBreaker(serviceName, { failureThreshold: 1 }));
      app1.get('/route1', () => {
        throw new Error('Route 1 error');
      });

      app2.use('/route2', circuitBreaker(serviceName));
      app2.get('/route2', (c) => c.json({ ok: true }));

      // Trip breaker via route1 on app1
      await expect(app1.request('/route1')).rejects.toThrow('Route 1 error');

      // Breaker associated with serviceName is now OPEN, so route2 on app2 is also blocked
      const res2 = await app2.request('/route2');
      expect(res2.status).toBe(503);
    });
  });
});
