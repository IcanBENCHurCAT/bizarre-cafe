import { describe, it, expect, beforeEach, vi } from 'vitest';

const { tables, mockSupabase } = vi.hoisted(() => {
  const tables: Record<string, any[]> = {
    owner_messages: [],
    owner_mood: [],
  };

  class MockQueryBuilder {
    private tableName: string;
    private currentRows: any[];
    private currentData: any = null;

    constructor(tableName: string) {
      this.tableName = tableName;
      if (!tables[tableName]) {
        tables[tableName] = [];
      }
      this.currentRows = [...tables[tableName]];
    }

    select(_fields = '*') {
      if (!this.currentData) {
        this.currentData = this.currentRows;
      }
      return this;
    }

    insert(data: any) {
      const toInsert = Array.isArray(data) ? data : [data];
      tables[this.tableName].push(...toInsert);
      this.currentRows.push(...toInsert);
      this.currentData = data;
      return this;
    }

    then(resolve: (val: any) => any, reject?: (err: any) => any) {
      const result = this.currentData ?? this.currentRows;
      return Promise.resolve({ data: result, error: null }).then(resolve, reject);
    }
  }

  const mockSupabase = {
    from: (tableName: string) => new MockQueryBuilder(tableName),
  };

  return { tables, mockSupabase };
});

vi.mock('../src/supabase/client', () => ({
  createSupabaseClient: () => mockSupabase,
  supabase: mockSupabase,
  supabaseAdmin: mockSupabase,
}));

import app from '../src/index';

describe('Owner Endpoint Security - Auth Enforcement', () => {
  beforeEach(() => {
    tables.owner_messages = [];
    tables.owner_mood = [];
  });

  it('should return 401 Unauthorized for unauthenticated requests to POST /api/owner/interact', async () => {
    const res = await app.request('/api/owner/interact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Hello owner!',
      }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('should allow authenticated requests to POST /api/owner/interact', async () => {
    const res = await app.request('/api/owner/interact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'test-owner-agent',
      },
      body: JSON.stringify({
        message: 'Hello owner!',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.approved).toBe(true);
    expect(body.ownerReply).toBeDefined();
  });
});
