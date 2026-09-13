import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Config environment variable validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should throw an error when JWT_SECRET is missing, even in test environment', async () => {
    vi.doMock('dotenv/config', () => ({}));
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'test';

    await expect(async () => {
      await import('../src/config.ts');
    }).rejects.toThrow('Missing required environment variable: JWT_SECRET');
  });

  it('should load config successfully when JWT_SECRET is present', async () => {
    process.env.JWT_SECRET = 'my-secure-test-jwt-secret';
    process.env.NODE_ENV = 'test';

    const { config } = await import('../src/config.ts');
    expect(config.jwtSecret).toBe('my-secure-test-jwt-secret');
    expect(config.algorandReceiverWallet).toBe('ALGO_BIZARRE_CAFE_WALLET_ADDRESS');
    expect(config.algorandIndexerUrl).toBe('http://localhost:8980');
    expect(config.algorandMockVerification).toBe(true);
  });

  it('should allow overriding Algorand configuration via environment variables', async () => {
    process.env.JWT_SECRET = 'my-secure-test-jwt-secret';
    process.env.ALGORAND_RECEIVER_WALLET = 'CUSTOM_ALGO_WALLET';
    process.env.ALGORAND_INDEXER_URL = 'https://custom-indexer.algo';
    process.env.ALGORAND_MOCK_VERIFICATION = 'false';

    const { config } = await import('../src/config.ts');
    expect(config.algorandReceiverWallet).toBe('CUSTOM_ALGO_WALLET');
    expect(config.algorandIndexerUrl).toBe('https://custom-indexer.algo');
    expect(config.algorandMockVerification).toBe(false);
  });
});
