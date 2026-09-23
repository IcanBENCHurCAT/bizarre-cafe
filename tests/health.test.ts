import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import app, { gracefulShutdown } from '../src/index';
import { db } from '../src/db';
import { OwnerCronService } from '../src/services/owner_cron';
import { clearDbHealthCache } from '../src/services/health';
import * as sse from '../src/sse';

describe('Health Diagnostics and Graceful Shutdown', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearDbHealthCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearDbHealthCache();
  });

  describe('GET /health endpoint diagnostics', () => {
    it('should return 200 with full health diagnostic schema and status "ok" when healthy', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe('ok');
      expect(data.version).toBe('0.1.0');
      expect(typeof data.uptimeSeconds).toBe('number');
      expect(typeof data.timestamp).toBe('string');
      expect(data.environment).toBeDefined();

      // Memory metrics
      expect(data.memory).toBeDefined();
      expect(typeof data.memory.rssMb).toBe('number');
      expect(typeof data.memory.heapUsedMb).toBe('number');
      expect(typeof data.memory.heapTotalMb).toBe('number');

      // Subsystems
      expect(data.subsystems).toBeDefined();
      expect(data.subsystems.database).toBeDefined();
      expect(data.subsystems.database.status).toBe('healthy');
      expect(typeof data.subsystems.database.latencyMs).toBe('number');

      expect(data.subsystems.sse).toBeDefined();
      expect(data.subsystems.sse.status).toBe('healthy');
      expect(typeof data.subsystems.sse.details?.activeConnections).toBe('number');

      expect(data.subsystems.cron).toBeDefined();
      expect(data.subsystems.cron.status).toBe('healthy');
      expect(typeof data.subsystems.cron.details?.running).toBe('boolean');
    });

    it('should report status "degraded" when database probe encounters an error', async () => {
      // Mock db.rooms.list to simulate database outage
      vi.spyOn(db.rooms, 'list').mockRejectedValueOnce(new Error('Connection terminated unexpectedly'));

      const res = await app.request('/health');
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe('degraded');
      expect(data.subsystems.database.status).toBe('degraded');
      expect(data.subsystems.database.error).toContain('Connection terminated unexpectedly');
    });

    it('should reuse cached database health check within TTL and avoid redundant database probes', async () => {
      const dbSpy = vi.spyOn(db.rooms, 'list');

      // First request triggers DB query
      const res1 = await app.request('/health');
      expect(res1.status).toBe(200);
      expect(dbSpy).toHaveBeenCalledTimes(1);

      // Second request within TTL uses cached DB health result
      const res2 = await app.request('/health');
      expect(res2.status).toBe(200);
      expect(dbSpy).toHaveBeenCalledTimes(1);

      // Clearing cache allows DB query on next request
      clearDbHealthCache();
      const res3 = await app.request('/health');
      expect(res3.status).toBe(200);
      expect(dbSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Graceful shutdown execution', () => {
    it('should cleanly stop OwnerCronService and clear all SSE clients upon shutdown signal', async () => {
      const stopCronSpy = vi.spyOn(OwnerCronService, 'stop');
      const clearClientsSpy = vi.spyOn(sse, 'clearAllClients');

      await gracefulShutdown('SIGTERM');

      expect(stopCronSpy).toHaveBeenCalledTimes(1);
      expect(clearClientsSpy).toHaveBeenCalledTimes(1);
    });
  });
});
