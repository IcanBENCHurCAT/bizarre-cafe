import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index';
import { db } from '../src/db';

describe('Lobby Security & Active Agents Privacy Tests', () => {
  beforeEach(async () => {
    // Reset agent status table for predictable state
    if (db.agents.updateStatus) {
      await db.agents.updateStatus('active-alice', { status: 'offline', current_room_id: null });
      await db.agents.updateStatus('active-bob', { status: 'offline', current_room_id: null });
    }
  });

  it('should mask private room ID in GET /api/lobby/active for unauthenticated and non-owner callers', async () => {
    // 1. Create a private room owned by 'owner-agent'
    const createPrivateRes = await app.request('/api/lobby/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'owner-agent',
      },
      body: JSON.stringify({ name: 'Secret Strategy Room', isPrivate: true }),
    });
    expect(createPrivateRes.status).toBe(201);
    const { room: privateRoom } = await createPrivateRes.json();

    // 2. Put 'active-alice' into the private room
    await db.agents.updateStatus('active-alice', {
      status: 'online',
      current_room_id: privateRoom.id,
    });

    // 3. Unauthenticated request to GET /api/lobby/active should mask current_room_id to null
    const unauthRes = await app.request('/api/lobby/active', { method: 'GET' });
    expect(unauthRes.status).toBe(200);
    const unauthData = await unauthRes.json();
    const aliceUnauth = unauthData.agents.find((a: any) => a.user_id === 'active-alice');
    expect(aliceUnauth).toBeDefined();
    expect(aliceUnauth.current_room_id).toBeNull();

    // 4. Non-owner authenticated request should also have current_room_id masked to null
    const nonOwnerRes = await app.request('/api/lobby/active', {
      method: 'GET',
      headers: {
        'X-Agent-ID': 'intruder-agent',
      },
    });
    expect(nonOwnerRes.status).toBe(200);
    const nonOwnerData = await nonOwnerRes.json();
    const aliceNonOwner = nonOwnerData.agents.find((a: any) => a.user_id === 'active-alice');
    expect(aliceNonOwner).toBeDefined();
    expect(aliceNonOwner.current_room_id).toBeNull();

    // 5. Room owner request SHOULD see the private room ID
    const ownerRes = await app.request('/api/lobby/active', {
      method: 'GET',
      headers: {
        'X-Agent-ID': 'owner-agent',
      },
    });
    expect(ownerRes.status).toBe(200);
    const ownerData = await ownerRes.json();
    const aliceOwner = ownerData.agents.find((a: any) => a.user_id === 'active-alice');
    expect(aliceOwner).toBeDefined();
    expect(aliceOwner.current_room_id).toBe(privateRoom.id);
  });

  it('should preserve current_room_id in GET /api/lobby/active for public rooms', async () => {
    // 1. Create a public room
    const createPublicRes = await app.request('/api/lobby/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'public-host',
      },
      body: JSON.stringify({ name: 'Public Courtyard', isPrivate: false }),
    });
    expect(createPublicRes.status).toBe(201);
    const { room: publicRoom } = await createPublicRes.json();

    // 2. Put 'active-bob' into the public room
    await db.agents.updateStatus('active-bob', {
      status: 'online',
      current_room_id: publicRoom.id,
    });

    // 3. Any caller (unauthenticated or another agent) should see the public room ID
    const res = await app.request('/api/lobby/active', { method: 'GET' });
    expect(res.status).toBe(200);
    const data = await res.json();
    const bob = data.agents.find((a: any) => a.user_id === 'active-bob');
    expect(bob).toBeDefined();
    expect(bob.current_room_id).toBe(publicRoom.id);
  });
});
