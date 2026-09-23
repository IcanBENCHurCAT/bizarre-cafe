import { describe, it, expect, vi } from 'vitest';

const { tables, mockSupabase } = vi.hoisted(() => {
  const tables: Record<string, any[]> = {
    cafe_events: [
      {
        id: 'evt-11111111-1111-1111-1111-111111111111',
        name: 'Past Meetup',
        description: 'A past cafe meetup',
        type: 'meetup',
        max_attendees: 50,
        location: 'Main Hall',
        host_id: 'host-agent-1',
        status: 'past',
        start_time: new Date(Date.now() - 86400000).toISOString(),
        created_at: new Date(Date.now() - 90000000).toISOString(),
        updated_at: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: 'evt-22222222-2222-2222-2222-222222222222',
        name: 'Upcoming Workshop',
        description: 'An upcoming cafe workshop',
        type: 'workshop',
        max_attendees: 30,
        location: 'Workshop Room',
        host_id: 'host-agent-2',
        status: 'upcoming',
        start_time: new Date(Date.now() + 86400000).toISOString(),
        created_at: new Date(Date.now() - 1000000).toISOString(),
        updated_at: new Date(Date.now() - 1000000).toISOString(),
      },
    ],
    event_attendance: [
      {
        id: 'att-1',
        event_id: 'evt-11111111-1111-1111-1111-111111111111',
        user_id: 'attendee-agent-1',
        status: 'joined',
        joined_at: new Date(Date.now() - 88000000).toISOString(),
      },
    ],
  };

  class MockQueryBuilder {
    private tableName: string;
    private currentRows: any[];
    private currentData: any = null;
    private isSingle = false;

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

    eq(col: string, val: any) {
      this.currentRows = this.currentRows.filter((r) => r[col] === val);
      this.currentData = this.currentRows;
      return this;
    }

    in(col: string, vals: any[]) {
      this.currentRows = this.currentRows.filter((r) => vals.includes(r[col]));
      this.currentData = this.currentRows;
      return this;
    }

    gte(col: string, val: any) {
      this.currentRows = this.currentRows.filter((r) => r[col] >= val);
      this.currentData = this.currentRows;
      return this;
    }

    order(col: string, opts?: { ascending?: boolean }) {
      const asc = opts?.ascending ?? true;
      this.currentRows.sort((a, b) => {
        if (a[col] < b[col]) return asc ? -1 : 1;
        if (a[col] > b[col]) return asc ? 1 : -1;
        return 0;
      });
      this.currentData = this.currentRows;
      return this;
    }

    limit(count: number) {
      this.currentRows = this.currentRows.slice(0, count);
      this.currentData = this.currentRows;
      return this;
    }

    single() {
      this.isSingle = true;
      return this;
    }

    then(resolve: (val: any) => any, reject?: (err: any) => any) {
      let result = this.currentData ?? this.currentRows;
      if (this.isSingle) {
        result = Array.isArray(result) ? (result[0] ?? null) : result;
      }
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

describe('Events API Endpoints & Security', () => {
  it('GET /api/events/past should return past events without authentication', async () => {
    const res = await app.request('/api/events/past');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('events');
    expect(Array.isArray(json.events)).toBe(true);
  });

  it('GET /api/events/past should safely handle authenticated host query', async () => {
    const res = await app.request('/api/events/past', {
      headers: {
        'X-Agent-ID': 'host-agent-1',
      },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('events');
    expect(Array.isArray(json.events)).toBe(true);
    expect(json.events.length).toBeGreaterThan(0);
  });

  it('GET /api/events/past should safely handle authenticated attendee query', async () => {
    const res = await app.request('/api/events/past', {
      headers: {
        'X-Agent-ID': 'attendee-agent-1',
      },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('events');
    expect(Array.isArray(json.events)).toBe(true);
    expect(json.events.length).toBeGreaterThan(0);
  });

  it('GET /api/events/past should safely handle SQL injection payloads in agentId header', async () => {
    const injectionPayloads = [
      "' OR '1'='1",
      "'; DROP TABLE cafe_events; --",
      "id.in.(select event_id from event_attendance)",
      "1'; SELECT * FROM users; --",
    ];

    for (const payload of injectionPayloads) {
      const res = await app.request('/api/events/past', {
        headers: {
          'X-Agent-ID': payload,
        },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty('events');
      expect(Array.isArray(json.events)).toBe(true);
    }
  });

  it('GET /api/events/upcoming should list upcoming events', async () => {
    const res = await app.request('/api/events/upcoming');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('events');
    expect(Array.isArray(json.events)).toBe(true);
  });
});
