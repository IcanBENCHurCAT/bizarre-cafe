import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateCompletion } from '../src/services/llm/cascade';
import { config } from '../src/config';
import { resetCascadeCacheForTest } from '../src/services/llm/providers';

// Helper to mock global fetch
const setupFetchMock = (mockFn: vi.Mock) => {
  global.fetch = mockFn;
};

const defaultFallbackConfig = {
  id: 'fallback',
  baseUrl: 'http://fallback/v1',
  apiKey: 'fallback-key',
  authHeader: 'Bearer fallback-key',
  model: 'fallback-model'
};

const messages = [{ role: 'user', content: 'hello' }];

describe('LLM Cascade Provider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    config.geminiApiKey = '';
    config.groqApiKey = '';
    config.openrouterApiKey = '';
    config.providerCascade = 'gemini,groq,openrouter';
    resetCascadeCacheForTest();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use fallback config if no cascade providers are configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'fallback-response' } }] })
    });
    setupFetchMock(fetchMock);

    const result = await generateCompletion(messages, defaultFallbackConfig);

    expect(result).toBe('fallback-response');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://fallback/v1/chat/completions');
  });

  it('should filter out providers missing API keys', async () => {
    config.geminiApiKey = 'gemini-key';
    config.openrouterApiKey = 'openrouter-key';
    // Groq is missing
    resetCascadeCacheForTest();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'gemini-response' } }] })
    });
    setupFetchMock(fetchMock);

    const result = await generateCompletion(messages, defaultFallbackConfig);

    expect(result).toBe('gemini-response');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('generativelanguage'); // Gemini URL
  });

  it('should failover to the next provider on retryable error (e.g., 500)', async () => {
    config.geminiApiKey = 'gemini-key';
    config.groqApiKey = 'groq-key';
    resetCascadeCacheForTest();

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({})
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'groq-response' } }] })
      });

    setupFetchMock(fetchMock);

    const result = await generateCompletion(messages, defaultFallbackConfig);

    expect(result).toBe('groq-response');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('generativelanguage'); // Gemini
    expect(fetchMock.mock.calls[1][0]).toContain('groq.com'); // Groq
  });

  it('should failover to the next provider on timeout or fetch error', async () => {
    config.geminiApiKey = 'gemini-key';
    config.groqApiKey = 'groq-key';
    resetCascadeCacheForTest();

    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'groq-response' } }] })
      });

    setupFetchMock(fetchMock);

    const result = await generateCompletion(messages, defaultFallbackConfig);

    expect(result).toBe('groq-response');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should fail fast and NOT failover on 401 Unauthorized', async () => {
    config.geminiApiKey = 'gemini-key';
    config.groqApiKey = 'groq-key';
    resetCascadeCacheForTest();

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({})
      });

    setupFetchMock(fetchMock);

    await expect(generateCompletion(messages, defaultFallbackConfig)).rejects.toThrow('API Error: 401');
    expect(fetchMock).toHaveBeenCalledTimes(1); // Should not call groq
  });

  it('should throw last error if ALL configured providers fail with retryable errors', async () => {
    config.geminiApiKey = 'gemini-key';
    config.groqApiKey = 'groq-key';
    resetCascadeCacheForTest();

    const fetchMock = vi.fn()
      .mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({})
      });

    setupFetchMock(fetchMock);

    await expect(generateCompletion(messages, defaultFallbackConfig)).rejects.toThrow('API Error: 503');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should respect custom BIZARRE_CAFE_PROVIDER_CASCADE ordering', async () => {
    config.geminiApiKey = 'gemini-key';
    config.groqApiKey = 'groq-key';
    config.providerCascade = 'groq, gemini';
    resetCascadeCacheForTest();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'response' } }] })
    });
    setupFetchMock(fetchMock);

    await generateCompletion(messages, defaultFallbackConfig);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('groq.com'); // Groq should be called first
  });
});
