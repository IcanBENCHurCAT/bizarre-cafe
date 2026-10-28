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

  it('should reject invalid, negative, or excessive limit values in GET /api/chat/messages and GET /api/chat/history', async () => {
    const roomId = 'public-test-room';

    // 1. Invalid non-numeric limit parameter -> 400 VALIDATION_ERROR
    const invalidLimitRes = await app.request(`/api/chat/messages?roomId=${roomId}&limit=invalid`);
    expect(invalidLimitRes.status).toBe(400);
    const invalidBody = await invalidLimitRes.json();
    expect(invalidBody.error.code).toBe('VALIDATION_ERROR');

    // 2. Negative limit parameter -> 400 VALIDATION_ERROR
    const negativeLimitRes = await app.request(`/api/chat/messages?roomId=${roomId}&limit=-5`);
    expect(negativeLimitRes.status).toBe(400);
    const negativeBody = await negativeLimitRes.json();
    expect(negativeBody.error.code).toBe('VALIDATION_ERROR');

    // 3. Excessive limit parameter (>100) -> 400 VALIDATION_ERROR
    const excessiveLimitRes = await app.request(`/api/chat/history?roomId=${roomId}&limit=500`);
    expect(excessiveLimitRes.status).toBe(400);
    const excessiveBody = await excessiveLimitRes.json();
    expect(excessiveBody.error.code).toBe('VALIDATION_ERROR');

    // 4. Zero limit parameter -> 400 VALIDATION_ERROR
    const zeroLimitRes = await app.request(`/api/chat/messages?roomId=${roomId}&limit=0`);
    expect(zeroLimitRes.status).toBe(400);

    // 5. Valid limit parameter within bounds (1-100) -> 200 OK
    const validLimitRes = await app.request(`/api/chat/messages?roomId=${roomId}&limit=25`);
    expect(validLimitRes.status).toBe(200);
  });
});
