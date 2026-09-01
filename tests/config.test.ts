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
  });
});
