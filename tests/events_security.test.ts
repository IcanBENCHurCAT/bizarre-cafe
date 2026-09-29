import { describe, it, expect } from 'vitest';
import app from '../src/index';

describe('Events Security & PostgREST Injection Protection', () => {
  it('should return past events for unauthenticated user without error', async () => {
    const res = await app.request('/api/events/past');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toBeDefined();
    expect(Array.isArray(body.events)).toBe(true);
  });

  it('should return past events for authenticated agent using correct column mapping without error', async () => {
    const res = await app.request('/api/events/past', {
      headers: {
        'X-Agent-ID': 'test-agent-123',
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toBeDefined();
    expect(Array.isArray(body.events)).toBe(true);
  });

  it('should safely handle agentId containing PostgREST injection characters', async () => {
    const injectionAgentId = 'malicious-agent",id.neq.0,host_id.eq."attacker';
    const res = await app.request('/api/events/past', {
      headers: {
        'X-Agent-ID': injectionAgentId,
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toBeDefined();
    expect(Array.isArray(body.events)).toBe(true);
  });
});
