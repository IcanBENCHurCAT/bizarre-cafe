import { describe, it, expect, vi } from 'vitest';

const { mockSupabase } = vi.hoisted(() => {
  class MockQueryBuilder {
    private isSingle = false;
    private isInsert = false;
    select() { return this; }
    update() { return this; }
    insert() {
      this.isInsert = true;
      return this;
    }
    eq() { return this; }
    gte() { return this; }
    order() { return this; }
    limit() { return this; }
    single() {
      this.isSingle = true;
      return this;
    }
    then(resolve: (val: any) => any) {
      if (this.isInsert) {
        return Promise.resolve({
          data: {
            id: 'mock-challenge-id',
            user_id: 'owner-agent',
            challenge: 'mock-challenge',
            expires_at: new Date().toISOString(),
            status: 'pending',
            created_at: new Date().toISOString(),
          },
          error: null,
        }).then(resolve);
      }
      if (this.isSingle) {
        return Promise.resolve({ data: null, error: { code: 'PGRST116' } }).then(resolve);
      }
      return Promise.resolve({ data: [], error: null }).then(resolve);
    }
  }

  const mockSupabase = {
    from: () => new MockQueryBuilder(),
  };

  return { mockSupabase };
});

vi.mock('../src/supabase/client', () => ({
  createServerSupabaseClient: () => mockSupabase,
  supabase: mockSupabase,
  supabaseAdmin: mockSupabase,
}));

import app from '../src/index';
import { createSqliteChallenge, getSqliteChallenge } from '../src/db/sqlite';

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

  it('should prevent an authenticated agent from accessing another agent verification status (403 Forbidden)', async () => {
    const res = await app.request('/api/verification/status?agentId=target-agent', {
      headers: {
        'X-Agent-ID': 'attacker-agent',
      },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toContain("Cannot access another agent's verification status");
  });

  it('should allow an authenticated agent to access their own verification status (200 OK)', async () => {
    const res = await app.request('/api/verification/status?agentId=owner-agent', {
      headers: {
        'X-Agent-ID': 'owner-agent',
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agentId).toBe('owner-agent');
  });

  it('should return 401 Unauthorized when unauthenticated request is made to /status', async () => {
    const res = await app.request('/api/verification/status?agentId=target-agent');
    expect(res.status).toBe(401);
  });

  it('should prevent an authenticated agent from requesting a challenge for another agent (403 Forbidden)', async () => {
    const res = await app.request('/api/verification/challenge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'attacker-agent',
      },
      body: JSON.stringify({
        agentId: 'target-agent',
      }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toContain('Cannot request verification challenge for another agent');
  });

  it('should allow an authenticated agent to request a challenge for themselves (200 OK)', async () => {
    const res = await app.request('/api/verification/challenge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'owner-agent',
      },
      body: JSON.stringify({
        agentId: 'owner-agent',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.challenge).toBeDefined();
    expect(body.challenge.agentId).toBe('owner-agent');
  });

  it('should prevent an authenticated agent from submitting a verification response for another agent (403 Forbidden)', async () => {
    const res = await app.request('/api/verification/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'attacker-agent',
      },
      body: JSON.stringify({
        agentId: 'target-agent',
        challenge: 'mock-challenge',
        signature: 'mock-signature-string-long-enough',
      }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toContain('Cannot submit verification challenge response for another agent');
  });

  it('should reject non-pending or expired challenges in getSqliteChallenge', async () => {
    const agentId = 'test-challenge-agent';
    const pendingId = 'challenge-pending-1';
    const verifiedId = 'challenge-verified-1';
    const expiredId = 'challenge-expired-1';

    const futureDate = new Date(Date.now() + 600000).toISOString();
    const pastDate = new Date(Date.now() - 600000).toISOString();

    // Create pending, verified, and expired challenges in SQLite
    await createSqliteChallenge({
      id: crypto.randomUUID(),
      user_id: agentId,
      challenge: pendingId,
      expires_at: futureDate,
      status: 'pending',
    });

    await createSqliteChallenge({
      id: crypto.randomUUID(),
      user_id: agentId,
      challenge: verifiedId,
      expires_at: futureDate,
      status: 'verified',
    });

    await createSqliteChallenge({
      id: crypto.randomUUID(),
      user_id: agentId,
      challenge: expiredId,
      expires_at: pastDate,
      status: 'pending',
    });

    // Valid pending challenge should be returned
    const pendingResult = await getSqliteChallenge(pendingId, agentId);
    expect(pendingResult).not.toBeNull();
    expect(pendingResult?.challenge).toBe(pendingId);

    // Non-pending (verified) challenge should NOT be returned
    const verifiedResult = await getSqliteChallenge(verifiedId, agentId);
    expect(verifiedResult).toBeNull();

    // Expired challenge should NOT be returned
    const expiredResult = await getSqliteChallenge(expiredId, agentId);
    expect(expiredResult).toBeNull();
  });
});
