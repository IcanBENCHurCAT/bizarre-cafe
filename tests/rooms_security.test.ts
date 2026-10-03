import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

  it('should reject unauthenticated request to POST /api/lobby/rooms with 401 Unauthorized', async () => {
    const res = await app.request('/api/lobby/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Unauthenticated Room' }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('should allow authenticated agent to create room in POST /api/lobby/rooms with owner_id set to agentId', async () => {
    const res = await app.request('/api/lobby/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'room-creator-agent',
      },
      body: JSON.stringify({ name: 'Authenticated Room', description: 'Room created by creator agent' }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.message).toBe('Room created');
    expect(body.room).toBeDefined();
    expect(body.room.owner_id).toBe('room-creator-agent');
  });

  it('should exclude private rooms from GET /api/lobby/rooms listing', async () => {
    // Create a public room
    const pubRes = await app.request('/api/lobby/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'public-creator',
      },
      body: JSON.stringify({ name: 'Public Lounge', isPrivate: false }),
    });
    expect(pubRes.status).toBe(201);
    const pubData = await pubRes.json();

    // Create a private room
    const privRes = await app.request('/api/lobby/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'private-creator',
      },
      body: JSON.stringify({ name: 'Secret Vault', isPrivate: true }),
    });
    expect(privRes.status).toBe(201);
    const privData = await privRes.json();

    // Fetch public rooms
    const listRes = await app.request('/api/lobby/rooms', {
      method: 'GET',
    });
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();

    const roomIds = listData.rooms.map((r: any) => r.id);
    expect(roomIds).toContain(pubData.room.id);
    expect(roomIds).not.toContain(privData.room.id);
  });

  it('should safely handle PostgREST injection characters in rooms.search', async () => {
    const { supabase } = await import('../src/supabase/client');
    const { rooms } = await import('../src/supabase/queries');

    let capturedOrFilter = '';
    const mockFrom = {
      select: () => mockFrom,
      is: () => mockFrom,
      or: (filterString: string) => {
        capturedOrFilter = filterString;
        return mockFrom;
      },
      order: () => mockFrom,
      range: () => Promise.resolve({ data: [], error: null }),
    };

    const spy = vi.spyOn(supabase, 'from').mockReturnValue(mockFrom as any);

    const injectionQuery = 'test",status.eq.private';
    await rooms.search(injectionQuery);

    expect(capturedOrFilter).toBe('name.ilike."%teststatus.eq.private%",description.ilike."%teststatus.eq.private%"');
    expect(capturedOrFilter).not.toContain('",status.eq.private');

    spy.mockRestore();
  });
});
