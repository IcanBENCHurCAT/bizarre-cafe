import { describe, it, expect } from 'vitest';
import app from '../src/index';

describe('Chat Security & Private Room Access Control Tests', () => {
  it('should enforce private room authorization for POST /api/chat/messages', async () => {
    // 1. Create a private room owned by 'owner-agent'
    const createRes = await app.request('/api/lobby/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'owner-agent',
      },
      body: JSON.stringify({ name: 'Private Secret Room', isPrivate: true }),
    });
    expect(createRes.status).toBe(201);
    const { room } = await createRes.json();

    // 2. Unauthenticated request to send message should fail (401)
    const unauthRes = await app.request('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: room.id, content: 'Hello secret room' }),
    });
    expect(unauthRes.status).toBe(401);

    // 3. Authenticated request from non-owner agent to send message should fail (403)
    const forbiddenRes = await app.request('/api/chat/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'intruder-agent',
      },
      body: JSON.stringify({ roomId: room.id, content: 'Spy message' }),
    });
    expect(forbiddenRes.status).toBe(403);
    const forbiddenBody = await forbiddenRes.json();
    expect(forbiddenBody.error.code).toBe('FORBIDDEN');

    // 4. Authenticated request from room owner to send message should succeed (201)
    const ownerRes = await app.request('/api/chat/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'owner-agent',
      },
      body: JSON.stringify({ roomId: room.id, content: 'Owner message' }),
    });
    expect(ownerRes.status).toBe(201);
  });

  it('should enforce private room authorization for GET /api/chat/messages and GET /api/chat/history', async () => {
    // 1. Create a private room owned by 'owner-agent'
    const createRes = await app.request('/api/lobby/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'owner-agent',
      },
      body: JSON.stringify({ name: 'Private Vault', isPrivate: true }),
    });
    expect(createRes.status).toBe(201);
    const { room } = await createRes.json();

    // 2. Unauthenticated request to GET /messages should fail (401)
    const unauthMsgs = await app.request(`/api/chat/messages?roomId=${room.id}`, {
      method: 'GET',
    });
    expect(unauthMsgs.status).toBe(401);

    // 3. Non-owner request to GET /messages should fail (403)
    const forbiddenMsgs = await app.request(`/api/chat/messages?roomId=${room.id}`, {
      method: 'GET',
      headers: { 'X-Agent-ID': 'intruder-agent' },
    });
    expect(forbiddenMsgs.status).toBe(403);

    // 4. Owner request to GET /messages should succeed (200)
    const ownerMsgs = await app.request(`/api/chat/messages?roomId=${room.id}`, {
      method: 'GET',
      headers: { 'X-Agent-ID': 'owner-agent' },
    });
    expect(ownerMsgs.status).toBe(200);

    // 5. Non-owner request to GET /history should fail (403)
    const forbiddenHist = await app.request(`/api/chat/history?roomId=${room.id}`, {
      method: 'GET',
      headers: { 'X-Agent-ID': 'intruder-agent' },
    });
    expect(forbiddenHist.status).toBe(403);

    // 6. Owner request to GET /history should succeed (200)
    const ownerHist = await app.request(`/api/chat/history?roomId=${room.id}`, {
      method: 'GET',
      headers: { 'X-Agent-ID': 'owner-agent' },
    });
    expect(ownerHist.status).toBe(200);
  });
});
