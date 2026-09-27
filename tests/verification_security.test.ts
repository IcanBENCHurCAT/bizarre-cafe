import { describe, it, expect, vi } from 'vitest';

const { mockSupabase } = vi.hoisted(() => {
  class MockQueryBuilder {
    select() { return this; }
    eq() { return this; }
    order() { return this; }
    limit() { return this; }
    then(resolve: (val: any) => any) {
      return Promise.resolve({ data: [], error: null }).then(resolve);
    }
  }

  const mockSupabase = {
    from: () => new MockQueryBuilder(),
  };

  return { mockSupabase };
});

vi.mock('../src/supabase/client', () => ({
  createSupabaseClient: () => mockSupabase,
  supabase: mockSupabase,
  supabaseAdmin: mockSupabase,
}));

import app from '../src/index';

describe('Verification Security - IDOR Protection', () => {
  it('should prevent an authenticated agent from accessing another agent verification log (403 Forbidden)', async () => {
    // Request verification log for 'target-agent' while authenticated as 'attacker-agent'
    const res = await app.request('/api/verification/log?agentId=target-agent', {
      headers: {
        'X-Agent-ID': 'attacker-agent',
      },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toContain("Cannot access another agent's verification log");
  });

  it('should allow an authenticated agent to access their own verification log (200 OK)', async () => {
    // Request verification log for 'owner-agent' while authenticated as 'owner-agent'
    const res = await app.request('/api/verification/log?agentId=owner-agent', {
      headers: {
        'X-Agent-ID': 'owner-agent',
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.log).toBeDefined();
    expect(Array.isArray(body.log)).toBe(true);
  });

  it('should return 401 Unauthorized when unauthenticated request is made', async () => {
    const res = await app.request('/api/verification/log?agentId=target-agent');
    expect(res.status).toBe(401);
  });
});
