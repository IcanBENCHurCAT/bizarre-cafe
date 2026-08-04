/**
 * Environment configuration
 *
 * Reads from process.env with sensible defaults and validates required keys at startup.
 */

export interface Config {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  databaseUrl: string;
  supabaseUrl: string;
  supabaseKey: string;
  supabaseServiceRoleKey: string;
  openaiApiKey: string;
  openaiBaseUrl: string;
  aiModel: string;
  algorandNetwork: string;
  algorandRpcUrl: string;
  x402Config: string;
  jwtSecret: string;
  jwtExpiry: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  sseTimeoutMs: number;
  sseHeartbeatMs: number;
}

const getRequired = (key: string): string => {
  const value = process.env[key];
  if (!value) {
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
  nodeEnv: (getOptional('NODE_ENV', 'development') as Config['nodeEnv']),
  databaseUrl: getRequired('DATABASE_URL'),
  supabaseUrl: getRequired('SUPABASE_URL'),
  supabaseKey: getRequired('SUPABASE_KEY'),
  supabaseServiceRoleKey: getRequired('SUPABASE_SERVICE_ROLE_KEY'),
  openaiApiKey: getRequired('OPENAI_API_KEY'),
  openaiBaseUrl: getOptional('OPENAI_BASE_URL', 'http://localhost:8080/v1'),
  aiModel: getOptional('AI_MODEL', 'qwen3.6-35b-a3b-nvfp4'),
  algorandNetwork: getOptional('ALGORAND_NETWORK', 'testnet'),
  algorandRpcUrl: getOptional(
    'ALGORAND_RPC_URL',
    'https://testnet-api.algonode.cloud'
  ),
  x402Config: getOptional('X402_CONFIG', '{}'),
  jwtSecret: getRequired('JWT_SECRET'),
  jwtExpiry: getOptional('JWT_EXPIRY', '24h'),
  rateLimitWindowMs: getNumber('RATE_LIMIT_WINDOW_MS', 900000),
  rateLimitMaxRequests: getNumber('RATE_LIMIT_MAX_REQUESTS', 100),
  sseTimeoutMs: getNumber('SSE_TIMEOUT_MS', 300000),
  sseHeartbeatMs: getNumber('SSE_HEARTBEAT_MS', 30000),
};
