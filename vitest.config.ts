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
      BIZARRE_CAFE_PROVIDER_CASCADE: 'none',
      GEMINI_API_KEY: '',
      GROQ_API_KEY: '',
      OPENROUTER_API_KEY: '',
      OPENAI_API_KEY: '',
      OPENAI_BASE_URL: 'http://127.0.0.1:1/v1',
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
