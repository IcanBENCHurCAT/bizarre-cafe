import { ProviderConfig, getCascadeOrder } from './providers';

/**
 * Generate completion utilizing a provider cascade.
 *
 * If a provider returns a retryable error (timeout, connection error, 408, 429, 5xx),
 * it fails over to the next provider in the cascade.
 *
 * If a provider returns a non-retryable error (e.g. 401, 403), it fails fast.
 *
 * If no cascade providers are configured, it falls back to the provided fallback configuration.
 */
export async function generateCompletion(
  messages: any[],
  fallbackConfig: ProviderConfig
): Promise<string> {
  const cascade = getCascadeOrder();

  // Backward compatibility: if no cascade keys are set, use the fallback.
  if (cascade.length === 0) {
    return attemptProvider(fallbackConfig, messages);
  }

  let lastError: Error | null = null;

  for (const provider of cascade) {
    try {
      console.warn(
        `[Narrative AI] Generating response via ${provider.baseUrl}/chat/completions (Model: ${provider.model})`
      );

      const content = await attemptProvider(provider, messages);
      console.warn(`[Narrative AI] Response generated successfully via ${provider.id}.`);
      return content;
    } catch (error: any) {
      if (error?.name === 'AbortError' || error?.message?.includes('fetch failed') || error?.message?.includes('network') || error?.message?.includes('timeout')) {
        console.error(`[Narrative AI] Provider ${provider.id} encountered network error, failing over. Error: ${error?.message}`);
        lastError = error;
        continue;
      }

      if (error instanceof ProviderError) {
        if (error.status === 401 || error.status === 403) {
          console.error(`[Narrative AI] Provider ${provider.id} returned auth error ${error.status}, failing fast.`);
          throw error;
        }

        const retryableStatuses = [408, 429, 500, 502, 503, 504];
        if (retryableStatuses.includes(error.status)) {
          console.error(`[Narrative AI] Provider ${provider.id} returned retryable error ${error.status}, failing over.`);
          lastError = error;
          continue;
        }

        console.error(`[Narrative AI] Provider ${provider.id} returned non-retryable error ${error.status}, failing fast.`);
        throw error;
      }

      console.error(`[Narrative AI] Provider ${provider.id} encountered unexpected error, failing over. Error: ${error?.message}`);
      lastError = error;
    }
  }

  throw lastError || new Error('All providers in cascade failed.');
}

class ProviderError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ProviderError';
  }
}

async function attemptProvider(provider: ProviderConfig, messages: any[]): Promise<string> {
  const url = `${provider.baseUrl}/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: provider.authHeader,
    },
    body: JSON.stringify({
      model: provider.model,
      messages: messages,
    }),
  });

  if (!res.ok) {
    console.error(`[Narrative AI] API Error: ${res.status} ${res.statusText} from ${provider.id || 'fallback'}`);
    throw new ProviderError(res.status, `API Error: ${res.status}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from LLM');
  }
  return content;
}
