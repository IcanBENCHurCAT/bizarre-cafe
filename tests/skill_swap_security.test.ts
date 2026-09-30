import { describe, it, expect } from 'vitest';
import app from '../src/index';

describe('Skill Swap Security & PostgREST Injection Protection', () => {
  it('should return 401 Unauthorized for unauthenticated requests to GET /api/skill-swap/trades', async () => {
    const res = await app.request('/api/skill-swap/trades');
    expect(res.status).toBe(401);
  });

  it('should return trades for authenticated agent without error', async () => {
    const res = await app.request('/api/skill-swap/trades', {
      headers: {
        'X-Agent-ID': 'test-agent-123',
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trades).toBeDefined();
    expect(Array.isArray(body.trades)).toBe(true);
  });

  it('should safely handle agentId containing PostgREST injection characters', async () => {
    const injectionAgentId = 'malicious-agent",from_agent_id.neq.0,to_user_id.eq."attacker';
    const res = await app.request('/api/skill-swap/trades', {
      headers: {
        'X-Agent-ID': injectionAgentId,
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.trades).toBeDefined();
    expect(Array.isArray(body.trades)).toBe(true);
  });
});
