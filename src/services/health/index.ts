import { config } from '../../config';
import { db } from '../../db';
import { getConnectedClientCount } from '../../sse';
import { OwnerCronService } from '../owner_cron';
import type { HealthDiagnosticResponse, MemoryUsageMetrics, SubsystemHealth } from './types';

export * from './types';

// In-memory cache for database health check (10s TTL)
const DB_HEALTH_CACHE_TTL_MS = 10000;
let cachedDatabaseHealth: SubsystemHealth | null = null;
let lastDbCheckTime = 0;
let activeDbCheckPromise: Promise<SubsystemHealth> | null = null;

/**
 * Clears the cached database health check result and resets pending probes.
 * Exposed for testing and explicit cache invalidation.
 */
export function clearDbHealthCache(): void {
  cachedDatabaseHealth = null;
  lastDbCheckTime = 0;
  activeDbCheckPromise = null;
}

/**
 * Performs a database health check probe or returns the cached result.
 */
async function getDatabaseHealth(): Promise<SubsystemHealth> {
  const now = Date.now();
  if (cachedDatabaseHealth && now - lastDbCheckTime < DB_HEALTH_CACHE_TTL_MS) {
    return cachedDatabaseHealth;
  }

  if (activeDbCheckPromise) {
    return activeDbCheckPromise;
  }

  activeDbCheckPromise = (async (): Promise<SubsystemHealth> => {
    const startDb = performance.now();
    try {
      if (config.useLocalDb) {
        await db.rooms.list({ limit: 1 });
      } else {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Database probe timed out')), 1500),
        );
        await Promise.race([db.rooms.list({ limit: 1 }), timeoutPromise]);
      }
      const latencyMs = Math.round(performance.now() - startDb);
      return {
        status: 'healthy',
        latencyMs,
        details: {
          type: config.useLocalDb ? 'sqlite' : 'supabase',
        },
      };
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - startDb);
      return {
        status: 'degraded',
        latencyMs,
        error: err?.message || String(err),
        details: {
          type: config.useLocalDb ? 'sqlite' : 'supabase',
        },
      };
    }
  })();

  try {
    const result = await activeDbCheckPromise;
    cachedDatabaseHealth = result;
    lastDbCheckTime = Date.now();
    return result;
  } finally {
    activeDbCheckPromise = null;
  }
}

/**
 * Health Diagnostics Service
 *
 * Probes core subsystems (database connectivity, SSE streaming active clients,
 * and autonomous Owner cron execution), calculates process runtime and memory metrics,
 * and compiles an aggregated diagnostic report for Cloud Run liveness/readiness probes.
 */
export async function getHealthDiagnostics(): Promise<HealthDiagnosticResponse> {
  const databaseHealth = await getDatabaseHealth();

  // SSE client metrics
  const activeSseConnections = getConnectedClientCount();
  const sseHealth: SubsystemHealth = {
    status: 'healthy',
    details: {
      activeConnections: activeSseConnections,
    },
  };

  // Autonomous cron metrics
  const cronRunning = OwnerCronService.isRunning();
  const cronHealth: SubsystemHealth = {
    status: 'healthy',
    details: {
      running: cronRunning,
      status: cronRunning ? 'running' : 'stopped',
    },
  };

  // Memory usage metrics
  const mem = process.memoryUsage();
  const memory: MemoryUsageMetrics = {
    rssMb: Math.round((mem.rss / (1024 * 1024)) * 100) / 100,
    heapUsedMb: Math.round((mem.heapUsed / (1024 * 1024)) * 100) / 100,
    heapTotalMb: Math.round((mem.heapTotal / (1024 * 1024)) * 100) / 100,
  };

  const uptimeSeconds = Math.floor(process.uptime());

  // Determine overall status: 'ok' if database is healthy, 'degraded' if database fails
  const isHealthy = databaseHealth.status === 'healthy';
  const overallStatus: HealthDiagnosticResponse['status'] = isHealthy ? 'ok' : 'degraded';

  return {
    status: overallStatus,
    version: '0.1.0',
    uptimeSeconds,
    uptime: uptimeSeconds,
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    memory,
    subsystems: {
      database: databaseHealth,
      sse: sseHealth,
      cron: cronHealth,
    },
  };
}
