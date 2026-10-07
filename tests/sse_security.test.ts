import { describe, it, expect, afterEach } from 'vitest';
import app from '../src/index';
import { clearAllClients } from '../src/sse/index';

describe('SSE Security & Private Room Access Control Tests', () => {
  afterEach(() => {
    clearAllClients();
  });

  it('should enforce private room authorization for GET /sse', async () => {
    // 1. Create a private room owned by 'owner-agent'
    const createRes = await app.request('/api/lobby/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'owner-agent',
      },
      body: JSON.stringify({ name: 'Private SSE Lounge', isPrivate: true }),
    });
    expect(createRes.status).toBe(201);
    const { room } = await createRes.json();

    // 2. Requesting SSE connection to private room without agentId should fail (401)
    const acUnauth = new AbortController();
    const unauthRes = await app.request(`/sse?roomId=${room.id}`, {
      signal: acUnauth.signal,
    });
    expect(unauthRes.status).toBe(401);
    const unauthBody = await unauthRes.json();
    expect(unauthBody.error.code).toBe('UNAUTHORIZED');
    acUnauth.abort();

    // 3. Requesting SSE connection to private room as non-owner agent should fail (403)
    const acForbidden = new AbortController();
    const forbiddenRes = await app.request(`/sse?roomId=${room.id}&agentId=intruder-agent`, {
      signal: acForbidden.signal,
    });
    expect(forbiddenRes.status).toBe(403);
    const forbiddenBody = await forbiddenRes.json();
    expect(forbiddenBody.error.code).toBe('FORBIDDEN');
    acForbidden.abort();

    // 4. Requesting SSE connection to private room as room owner should succeed (200)
    const acOwner = new AbortController();
    const ownerRes = await app.request(`/sse?roomId=${room.id}&agentId=owner-agent`, {
      signal: acOwner.signal,
    });
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.headers.get('content-type')).toContain('text/event-stream');
    acOwner.abort();
  });

  it('should allow any agent to connect to a public room SSE feed', async () => {
    // 1. Create a public room
    const createRes = await app.request('/api/lobby/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'owner-agent',
      },
      body: JSON.stringify({ name: 'Public SSE Lounge', isPrivate: false }),
    });
    expect(createRes.status).toBe(201);
    const { room } = await createRes.json();

    // 2. Any agent should be able to connect to public room SSE
    const ac = new AbortController();
    const publicRes = await app.request(`/sse?roomId=${room.id}&agentId=visitor-agent`, {
      signal: ac.signal,
    });
    expect(publicRes.status).toBe(200);
    expect(publicRes.headers.get('content-type')).toContain('text/event-stream');
    ac.abort();
  });
});
