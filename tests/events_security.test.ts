import { describe, it, expect } from 'vitest';
import app from '../src/index';
import { config } from '../src/config';
import * as supabaseClientModule from '../src/supabase/client';
import { vi } from 'vitest';

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

  it('should handle concurrent POST /api/events/:id/join requests gracefully without creating duplicates', async () => {
    const fakeUuid = '00000000-0000-0000-0000-000000000000';

    // 1. Override config inside the test so the handler does not fail fast at the local/test-mode check
    const originalUseLocalDb = config.useLocalDb;
    const originalNodeEnv = config.nodeEnv;
    config.useLocalDb = false;
    config.nodeEnv = 'development'; // avoid failing on nodeEnv === 'test'

    // Track if onConflict was correctly passed
    let upsertCalledWithOnConflict = false;

    // 2. Stub createServerSupabaseClient with a minimal chainable mock covering only the calls /join makes
    const mockSupabase = {
      from: (table: string) => {
        if (table === 'cafe_events') {
          return {
            select: () => ({
              eq: () => ({
                single: () => ({
                  then: (resolve: any) => resolve({
                    data: {
                      id: fakeUuid,
                      status: 'upcoming',
                      max_attendees: 50,
                    },
                    error: null,
                  })
                })
              })
            })
          };
        } else if (table === 'event_attendance') {
          return {
            select: (cols: string, opts: any) => {
              if (opts && opts.count === 'exact') {
                return {
                  eq: () => ({
                    eq: () => ({
                      then: (resolve: any) => resolve({
                        count: 0,
                        error: null,
                      })
                    })
                  })
                };
              }
              // existingPromise
              return {
                eq: () => ({
                  eq: () => ({
                    single: () => ({
                      then: (resolve: any) => resolve({
                        data: null,
                        error: null,
                      })
                    })
                  })
                })
              };
            },
            upsert: (data: any, options: any) => {
              if (options && options.onConflict === 'event_id,user_id') {
                upsertCalledWithOnConflict = true;
              }
              return {
                select: () => ({
                  single: () => ({
                    then: (resolve: any) => resolve({
                      data: {
                        id: 'new-attendance-id',
                        event_id: fakeUuid,
                        user_id: 'participant-agent-1',
                        status: 'joined',
                        joined_at: new Date().toISOString(),
                      },
                      error: null,
                    })
                  })
                })
              };
            }
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }
    };

    vi.spyOn(supabaseClientModule, 'createServerSupabaseClient').mockImplementation(() => mockSupabase as any);

    try {
      // Simulate double-join by executing the join endpoint concurrently
      const [res1, res2] = await Promise.all([
        app.request(`/api/events/${fakeUuid}/join`, {
          method: 'POST',
          headers: {
            'X-Agent-ID': 'participant-agent-1',
          },
        }),
        app.request(`/api/events/${fakeUuid}/join`, {
          method: 'POST',
          headers: {
            'X-Agent-ID': 'participant-agent-1',
          },
        }),
      ]);

      const body1 = await res1.json();
      const body2 = await res2.json();
      if (res1.status === 500) console.log(body1);
      if (res2.status === 500) console.log(body2);

      // Both should return 201
      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);


      expect(body1.message).toBe('Joined event');
      expect(body2.message).toBe('Joined event');

      // Assert that upsert was called with onConflict event_id,user_id
      expect(upsertCalledWithOnConflict).toBe(true);

    } finally {
      // Restore config and mock
      config.useLocalDb = originalUseLocalDb;
      config.nodeEnv = originalNodeEnv;
      vi.restoreAllMocks();
    }
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

  it('should reject invalid, negative, or excessive limit values in GET /api/events/upcoming with 400 Bad Request', async () => {
    // 1. Invalid non-numeric string
    const resInvalid = await app.request('/api/events/upcoming?limit=invalid');
    expect(resInvalid.status).toBe(400);
    const bodyInvalid = await resInvalid.json();
    expect(bodyInvalid.error.code).toBe('VALIDATION_ERROR');

    // 2. Negative limit
    const resNegative = await app.request('/api/events/upcoming?limit=-5');
    expect(resNegative.status).toBe(400);
    const bodyNegative = await resNegative.json();
    expect(bodyNegative.error.code).toBe('VALIDATION_ERROR');

    // 3. Excessive limit (>100)
    const resExcessive = await app.request('/api/events/upcoming?limit=999');
    expect(resExcessive.status).toBe(400);
    const bodyExcessive = await resExcessive.json();
    expect(bodyExcessive.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject invalid, negative, or excessive limit values in GET /api/events/past with 400 Bad Request', async () => {
    // 1. Invalid non-numeric string
    const resInvalid = await app.request('/api/events/past?limit=abc');
    expect(resInvalid.status).toBe(400);
    const bodyInvalid = await resInvalid.json();
    expect(bodyInvalid.error.code).toBe('VALIDATION_ERROR');

    // 2. Negative limit
    const resNegative = await app.request('/api/events/past?limit=-10');
    expect(resNegative.status).toBe(400);
    const bodyNegative = await resNegative.json();
    expect(bodyNegative.error.code).toBe('VALIDATION_ERROR');

    // 3. Excessive limit (>100)
    const resExcessive = await app.request('/api/events/past?limit=500');
    expect(resExcessive.status).toBe(400);
    const bodyExcessive = await resExcessive.json();
    expect(bodyExcessive.error.code).toBe('VALIDATION_ERROR');
  });
});
