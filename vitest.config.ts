import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    env: {
      JWT_SECRET: 'test-jwt-secret-key-for-testing-purposes-only',
      ALLOW_AUTH_BYPASS: 'true',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 65,
        functions: 59,
        branches: 54,
        statements: 64.09,
      },
    },
  },
});
