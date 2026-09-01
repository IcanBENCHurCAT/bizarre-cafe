/**
 * Environment configuration
 *
 * Reads from process.env with sensible defaults and validates required keys at startup.
 */

import 'dotenv/config';

export interface Config {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  useLocalDb: boolean;
  databaseUrl: string;
  supabaseUrl: string;
  supabaseKey: string;
  supabaseServiceRoleKey: string;
  openaiApiKey: string;
  openaiBaseUrl: string;
  aiModel: string;
  algorandNetwork: string;
  algorandRpcUrl: string;
  algorandAlgodToken: string;
  x402Config: string;
  jwtSecret: string;
  jwtExpiry: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  sseTimeoutMs: number;
  sseHeartbeatMs: number;
  corsAllowedOrigins: string | string[];
}

const getRequired = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    if (process.env.NODE_ENV === 'test') {
      return 'dummy-test-secret-key';
    }
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const getOptional = (key: string, fallback: string): string => {
  return process.env[key] ?? fallback;
};

const getNumber = (key: string, fallback: number): number => {
  const value = process.env[key];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid number for ${key}: ${value}`);
  }
  return parsed;
};

export const config: Config = {
  port: getNumber('PORT', 3000),
  nodeEnv: getOptional('NODE_ENV', 'development') as Config['nodeEnv'],
  useLocalDb: getOptional('USE_LOCAL_DB', 'false') === 'true',
  databaseUrl: getOptional('DATABASE_URL', 'sqlite.db'),
  supabaseUrl: getOptional('SUPABASE_URL', ''),
  supabaseKey: getOptional('SUPABASE_KEY', ''),
  supabaseServiceRoleKey: getOptional('SUPABASE_SERVICE_ROLE_KEY', ''),
  openaiApiKey: getOptional('OPENAI_API_KEY', 'dummy-key'),
  openaiBaseUrl: getOptional('OPENAI_BASE_URL', 'http://localhost:8080/v1'),
  aiModel: getOptional('AI_MODEL', 'qwen3.6-35b-a3b-nvfp4'),
  algorandNetwork: getOptional('ALGORAND_NETWORK', 'localnet'),
  algorandRpcUrl: getOptional('ALGORAND_RPC_URL', 'http://localhost:4001'),
  algorandAlgodToken: getOptional(
    'ALGORAND_ALGOD_TOKEN',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  ),
  x402Config: getOptional('X402_CONFIG', '{}'),
  jwtSecret: process.env.NODE_ENV === 'test' ? getOptional('JWT_SECRET', 'test-jwt-secret') : getRequired('JWT_SECRET'),
  jwtExpiry: getOptional('JWT_EXPIRY', '24h'),
  rateLimitWindowMs: getNumber('RATE_LIMIT_WINDOW_MS', 900000),
  rateLimitMaxRequests: getNumber('RATE_LIMIT_MAX_REQUESTS', 100),
  sseTimeoutMs: getNumber('SSE_TIMEOUT_MS', 300000),
  sseHeartbeatMs: getNumber('SSE_HEARTBEAT_MS', 30000),
  corsAllowedOrigins: (() => {
    const rawOrigins = getOptional('CORS_ALLOWED_ORIGINS', '*');
    return rawOrigins.includes(',') ? rawOrigins.split(',').map((o) => o.trim()) : rawOrigins;
  })(),
};
