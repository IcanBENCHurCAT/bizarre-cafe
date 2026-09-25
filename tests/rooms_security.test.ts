import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import app from '../src/index';
import { clearAllClients, getRoomAgents } from '../src/sse/index';

describe('Room Security & Access Control Tests', () => {
  const abortControllers: AbortController[] = [];

  beforeEach(() => {
    clearAllClients();
  });

  afterEach(() => {
    for (const ac of abortControllers) ac.abort();
    abortControllers.length = 0;
    clearAllClients();
  });

  it('should prevent authenticated agent from impersonating another agent in POST /api/rooms/:roomId/join', async () => {
    const acTarget = new AbortController();
    const acAttacker = new AbortController();
    abortControllers.push(acTarget, acAttacker);

    // Target agent connects to room-alpha via SSE
    await app.request('/sse?agentId=target-agent&roomId=room-alpha', {
      signal: acTarget.signal,
    });

    // Attacker agent connects to room-alpha via SSE
    await app.request('/sse?agentId=attacker-agent&roomId=room-alpha', {
      signal: acAttacker.signal,
    });

    expect(getRoomAgents('room-alpha')).toContain('target-agent');
    expect(getRoomAgents('room-alpha')).toContain('attacker-agent');
    expect(getRoomAgents('room-beta')).not.toContain('target-agent');

    // Attacker authenticated as attacker-agent tries to force target-agent into room-beta via body.agentId
    const res = await app.request('/api/rooms/room-beta/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'attacker-agent',
      },
      body: JSON.stringify({ agentId: 'target-agent' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    // Response should be for attacker-agent, NOT target-agent
    expect(body.agentId).toBe('attacker-agent');

    // target-agent should remain in room-alpha and NOT be moved to room-beta
    expect(getRoomAgents('room-alpha')).toContain('target-agent');
    expect(getRoomAgents('room-beta')).not.toContain('target-agent');
    // attacker-agent should have been moved to room-beta
    expect(getRoomAgents('room-beta')).toContain('attacker-agent');
  });

  it('should prevent authenticated agent from kicking another agent in POST /api/rooms/:roomId/leave', async () => {
    const acTarget = new AbortController();
    abortControllers.push(acTarget);

    // Target agent connects to room-secure
    await app.request('/sse?agentId=target-agent&roomId=room-secure', {
      signal: acTarget.signal,
    });

    expect(getRoomAgents('room-secure')).toContain('target-agent');

    // Attacker authenticated as attacker-agent tries to force target-agent out of room-secure
    const res = await app.request('/api/rooms/room-secure/leave', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'attacker-agent',
      },
      body: JSON.stringify({ agentId: 'target-agent' }),
    });

    expect(res.status).toBe(200);

    // target-agent should still be in room-secure
    expect(getRoomAgents('room-secure')).toContain('target-agent');
  });
});
