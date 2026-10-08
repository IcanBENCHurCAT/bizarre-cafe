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

    single() {
      if (Array.isArray(this.currentData)) {
        this.currentData = this.currentData[0] ?? null;
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
  createServerSupabaseClient: () => mockSupabase,
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

  it('should enforce private room authorization for POST /api/owner/message and POST /api/owner/interact', async () => {
    // 1. Create a private room owned by 'room-owner-agent'
    const createRes = await app.request('/api/lobby/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'room-owner-agent',
      },
      body: JSON.stringify({ name: 'Private Secret Room', isPrivate: true }),
    });
    expect(createRes.status).toBe(201);
    const { room } = await createRes.json();

    // 2. Non-owner request to POST /api/owner/message with private roomId should return 403 Forbidden
    const forbiddenMsg = await app.request('/api/owner/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'intruder-agent',
      },
      body: JSON.stringify({
        content: 'Unauthorized owner prompt in private room',
        roomId: room.id,
      }),
    });
    expect(forbiddenMsg.status).toBe(403);
    const forbiddenMsgBody = await forbiddenMsg.json();
    expect(forbiddenMsgBody.error.code).toBe('FORBIDDEN');

    // 3. Non-owner request to POST /api/owner/interact with private roomId should return 403 Forbidden
    const forbiddenInteract = await app.request('/api/owner/interact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'intruder-agent',
      },
      body: JSON.stringify({
        message: 'Unauthorized owner prompt in private room',
        roomId: room.id,
      }),
    });
    expect(forbiddenInteract.status).toBe(403);
    const forbiddenInteractBody = await forbiddenInteract.json();
    expect(forbiddenInteractBody.error.code).toBe('FORBIDDEN');

    // 4. Room owner request to POST /api/owner/message with private roomId should succeed (200)
    const ownerMsg = await app.request('/api/owner/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'room-owner-agent',
      },
      body: JSON.stringify({
        content: 'Authorized owner prompt in private room',
        roomId: room.id,
      }),
    });
    expect(ownerMsg.status).toBe(200);

    // 5. Room owner request to POST /api/owner/interact with private roomId should succeed (200)
    const ownerInteract = await app.request('/api/owner/interact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-ID': 'room-owner-agent',
      },
      body: JSON.stringify({
        message: 'Authorized owner prompt in private room',
        roomId: room.id,
      }),
    });
    expect(ownerInteract.status).toBe(200);
  });
});
