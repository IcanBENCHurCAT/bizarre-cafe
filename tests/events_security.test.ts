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

  it('should handle POST /api/events/create in local/test execution mode', async () => {
    const res = await app.request('/api/events/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'host-agent-1',
      },
      body: JSON.stringify({
        name: 'Local Dev Meetup',
        description: 'A test event for local dev mode',
        type: 'meetup',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.message).toBe('Event created');
    expect(body.event).toBeDefined();
    expect(body.event.name).toBe('Local Dev Meetup');
  });

  it('should handle GET /api/events/upcoming gracefully in local/test execution mode', async () => {
    const res = await app.request('/api/events/upcoming');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toBeDefined();
    expect(Array.isArray(body.events)).toBe(true);
  });

  it('should handle GET /api/events/:id gracefully when event is not found or in test execution mode', async () => {
    const fakeUuid = '00000000-0000-0000-0000-000000000000';
    const res = await app.request(`/api/events/${fakeUuid}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('should handle POST /api/events/:id/join gracefully in test/local execution mode', async () => {
    const fakeUuid = '00000000-0000-0000-0000-000000000000';
    const res = await app.request(`/api/events/${fakeUuid}/join`, {
      method: 'POST',
      headers: {
        'X-Agent-ID': 'participant-agent-1',
      },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('should handle POST /api/events/:id/leave gracefully in test/local execution mode', async () => {
    const fakeUuid = '00000000-0000-0000-0000-000000000000';
    const res = await app.request(`/api/events/${fakeUuid}/leave`, {
      method: 'POST',
      headers: {
        'X-Agent-ID': 'participant-agent-1',
      },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});
