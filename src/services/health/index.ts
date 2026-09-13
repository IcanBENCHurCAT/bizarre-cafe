import { config } from '../../config';
import { db } from '../../db';
import { getConnectedClientCount } from '../../sse';
import { OwnerCronService } from '../owner_cron';
import type { HealthDiagnosticResponse, MemoryUsageMetrics, SubsystemHealth } from './types';

export * from './types';

/**
 * Health Diagnostics Service
 *
 * Probes core subsystems (database connectivity, SSE streaming active clients,
 * and autonomous Owner cron execution), calculates process runtime and memory metrics,
 * and compiles an aggregated diagnostic report for Cloud Run liveness/readiness probes.
 */
export async function getHealthDiagnostics(): Promise<HealthDiagnosticResponse> {
  const startDb = performance.now();
  let databaseHealth: SubsystemHealth;

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
    databaseHealth = {
      status: 'healthy',
      latencyMs,
      details: {
        type: config.useLocalDb ? 'sqlite' : 'supabase',
      },
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - startDb);
    databaseHealth = {
      status: 'degraded',
      latencyMs,
      error: err?.message || String(err),
      details: {
        type: config.useLocalDb ? 'sqlite' : 'supabase',
      },
    };
  }

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
