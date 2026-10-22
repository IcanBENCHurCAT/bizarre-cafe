import { describe, it, expect } from 'vitest';
import app from '../src/index';

describe('Chat Unread Security & Access Control Tests', () => {
  it('should enforce private room authorization for GET /api/chat/unread', async () => {
    // 1. Create a private room owned by 'owner-agent'
    const createRes = await app.request('/api/lobby/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'owner-agent',
      },
      body: JSON.stringify({ name: 'Secret Unread Room', isPrivate: true }),
    });
    expect(createRes.status).toBe(201);
    const { room } = await createRes.json();

    // 2. Unauthenticated request to GET /api/chat/unread should fail (401)
    const unauthRes = await app.request(`/api/chat/unread?roomId=${room.id}`, {
      method: 'GET',
    });
    expect(unauthRes.status).toBe(401);

    // 3. Authenticated request from non-owner agent should fail (403 Forbidden)
    const forbiddenRes = await app.request(`/api/chat/unread?roomId=${room.id}`, {
      method: 'GET',
      headers: { 'X-Agent-ID': 'intruder-agent' },
    });
    expect(forbiddenRes.status).toBe(403);
    const forbiddenBody = await forbiddenRes.json();
    expect(forbiddenBody.error.code).toBe('FORBIDDEN');

    // 4. Authenticated request from room owner should succeed (200 OK)
    const ownerRes = await app.request(`/api/chat/unread?roomId=${room.id}`, {
      method: 'GET',
      headers: { 'X-Agent-ID': 'owner-agent' },
    });
    expect(ownerRes.status).toBe(200);
    const ownerBody = await ownerRes.json();
    expect(ownerBody.roomId).toBe(room.id);
    expect(typeof ownerBody.unreadCount).toBe('number');
  });

  it('should allow any authenticated agent to access GET /api/chat/unread for public rooms', async () => {
    // 1. Create a public room
    const createRes = await app.request('/api/lobby/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'creator-agent',
      },
      body: JSON.stringify({ name: 'Public Cafe Corner', isPrivate: false }),
    });
    expect(createRes.status).toBe(201);
    const { room } = await createRes.json();

    // 2. Any authenticated agent should be able to get unread count
    const visitorRes = await app.request(`/api/chat/unread?roomId=${room.id}`, {
      method: 'GET',
      headers: { 'X-Agent-ID': 'visitor-agent' },
    });
    expect(visitorRes.status).toBe(200);
    const visitorBody = await visitorRes.json();
    expect(visitorBody.roomId).toBe(room.id);
    expect(typeof visitorBody.unreadCount).toBe('number');
  });
});
