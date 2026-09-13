/**
 * Diagnostic Health Types
 *
 * Defines subsystem health statuses, memory usage metrics,
 * and comprehensive diagnostic response interfaces for Cloud Run and monitoring.
 */

export type SubsystemStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface SubsystemHealth {
  status: SubsystemStatus;
  latencyMs?: number;
  details?: Record<string, unknown>;
  error?: string;
}

export interface MemoryUsageMetrics {
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
}

export interface HealthDiagnosticResponse {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  environment?: string;
  uptime?: number;
  memory: MemoryUsageMetrics;
  subsystems: {
    database: SubsystemHealth;
    sse: SubsystemHealth;
    cron: SubsystemHealth;
  };
}
