import { config } from '../../config';

export interface ProviderConfig {
  id: string;
  baseUrl: string;
  apiKey: string;
  authHeader: string;
  model: string;
}

export function getProviderRegistry(): Record<string, ProviderConfig> {
  const registry: Record<string, ProviderConfig> = {};

  if (config.geminiApiKey) {
    registry['gemini'] = {
      id: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: config.geminiApiKey,
      authHeader: `Bearer ${config.geminiApiKey}`,
      model: config.geminiModel,
    };
  }

  if (config.groqApiKey) {
    registry['groq'] = {
      id: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: config.groqApiKey,
      authHeader: `Bearer ${config.groqApiKey}`,
      model: config.groqModel,
    };
  }

  if (config.openrouterApiKey) {
    registry['openrouter'] = {
      id: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: config.openrouterApiKey,
      authHeader: `Bearer ${config.openrouterApiKey}`,
      model: config.openrouterModel,
    };
  }

  return registry;
}

let cachedCascade: ProviderConfig[] | null = null;

export function getCascadeOrder(): ProviderConfig[] {
  if (cachedCascade !== null) {
    return cachedCascade;
  }

  const registry = getProviderRegistry();
  const rawOrder = config.providerCascade || 'gemini,groq,openrouter';

  const providers = rawOrder
    .split(',')
    .map(p => p.trim().toLowerCase())
    .map(id => registry[id])
    .filter((p): p is ProviderConfig => p !== undefined);

  cachedCascade = providers;

  const activeIds = providers.map(p => p.id).join(', ');
  if (activeIds) {
    console.warn(`[Narrative AI] Active LLM providers in cascade: ${activeIds}`);
  } else {
    console.warn(`[Narrative AI] No cascade providers configured, using fallback.`);
  }

  return providers;
}

export function resetCascadeCacheForTest(): void {
  cachedCascade = null;
}
