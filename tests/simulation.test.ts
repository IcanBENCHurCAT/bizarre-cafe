import { describe, it, expect, vi, beforeEach } from 'vitest';

const { tables, mockSupabase } = vi.hoisted(() => {
  const tables: Record<string, any[]> = {
    verification_challenges: [],
    agent_verification: [],
    receipts: [],
    shop_items: [
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Quantum Espresso Beans',
        description: 'Beans roasted in multiple dimensions simultaneously',
        price: 50,
        currency: 'microUSDC',
        stock: 100,
        is_active: true,
        image_url: null,
        created_at: new Date().toISOString(),
      },
    ],
    owner_messages: [],
    owner_mood: [
      {
        id: '1',
        mood: 'mysterious',
        stress_level: 25,
        last_interaction: new Date().toISOString(),
        total_interactions: 0,
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
      for (const item of toInsert) {
        if (!item.id) {
          item.id = '00000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padStart(12, '0');
        }
      }
      tables[this.tableName].push(...toInsert);
      this.currentRows.push(...toInsert);
      this.currentData = data;
      return this;
    }

    update(updates: any) {
      for (const row of this.currentRows) {
        Object.assign(row, updates);
      }
      for (const row of tables[this.tableName]) {
        const match = this.currentRows.find((r) => r.id && r.id === row.id);
        if (match) {
          Object.assign(row, updates);
        }
      }
      this.currentData = this.currentRows;
      return this;
    }

    upsert(data: any) {
      const toUpsert = Array.isArray(data) ? data : [data];
      for (const item of toUpsert) {
        const idx = tables[this.tableName].findIndex(
          (r) => (item.id && r.id === item.id) || (item.user_id && r.user_id === item.user_id),
        );
        if (idx >= 0) {
          tables[this.tableName][idx] = { ...tables[this.tableName][idx], ...item };
        } else {
          tables[this.tableName].push(item);
        }
      }
      this.currentData = data;
      return this;
    }

    eq(col: string, val: any) {
      this.currentRows = this.currentRows.filter((r) => r[col] === val);
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

import {
  checkServerHealth,
  createAgentPersonas,
  generatePersonaReply,
  SimulationStatsTracker,
  runSimulation,
} from '../scripts/simulate-agents';

describe('Simulation Helper & Harness Tests (US4)', () => {
  describe('checkServerHealth', () => {
    it('should return true when /health responds with 200 and { status: "ok" }', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok', version: '0.1.0' }),
      }) as unknown as typeof fetch;

      const result = await checkServerHealth('http://localhost:3000', 3, 10, mockFetch);
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should retry when initial attempts fail and succeed once /health responds', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Connection refused');
        }
        return {
          ok: true,
          json: async () => ({ status: 'ok' }),
        };
      }) as unknown as typeof fetch;

      const result = await checkServerHealth('http://localhost:3000', 5, 10, mockFetch);
      expect(result).toBe(true);
      expect(callCount).toBe(3);
    });

    it('should return false if server remains unreachable after maxAttempts', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused')) as unknown as typeof fetch;

      const result = await checkServerHealth('http://localhost:3000', 2, 5, mockFetch);
      expect(result).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Agent Personas & Dialogue Generation', () => {
    it('should define three distinct personas (Alice, Bob, Charlie)', () => {
      const personas = createAgentPersonas();
      expect(personas.length).toBe(3);

      const [alice, bob, charlie] = personas;
      expect(alice.name).toBe('Alice');
      expect(alice.agentId).toBe('agent-alice');
      expect(alice.fallbacks.length).toBeGreaterThan(0);

      expect(bob.name).toBe('Bob');
      expect(bob.agentId).toBe('agent-bob');
      expect(bob.fallbacks.length).toBeGreaterThan(0);

      expect(charlie.name).toBe('Charlie');
      expect(charlie.agentId).toBe('agent-charlie');
      expect(charlie.fallbacks.length).toBeGreaterThan(0);
    });

    it('should generate dialogue via simulated LLM response when online', async () => {
      const personas = createAgentPersonas();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'I observed a temporal distortion in the espresso grind. Most fascinating.',
              },
            },
          ],
        }),
      }) as unknown as typeof fetch;

      const reply = await generatePersonaReply(personas[0], 'Look at the coffee', 0, {
        llmUrl: 'http://mock-llm:8080/v1',
        fetchFn: mockFetch,
      });

      expect(reply).toBe('I observed a temporal distortion in the espresso grind. Most fascinating.');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should fall back deterministically without throwing when LLM endpoint is offline', async () => {
      const personas = createAgentPersonas();
      const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

      const reply0 = await generatePersonaReply(personas[0], 'Hello', 0, {
        llmUrl: 'http://offline-llm:8080/v1',
        fetchFn: mockFetch,
      });
      const reply1 = await generatePersonaReply(personas[0], 'Hello again', 1, {
        llmUrl: 'http://offline-llm:8080/v1',
        fetchFn: mockFetch,
      });

      expect(reply0).toBe(personas[0].fallbacks[0]);
      expect(reply1).toBe(personas[0].fallbacks[1]);
    });

    it('should support forceFallback mode to skip LLM calls entirely', async () => {
      const personas = createAgentPersonas();
      const mockFetch = vi.fn();

      const reply = await generatePersonaReply(personas[1], 'Context', 2, {
        forceFallback: true,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(reply).toBe(personas[1].fallbacks[2 % personas[1].fallbacks.length]);
    });
  });

  describe('SimulationStatsTracker', () => {
    it('should correctly track metrics and output formatted summary', () => {
      const tracker = new SimulationStatsTracker();

      tracker.recordMessage();
      tracker.recordMessage();
      tracker.recordPayment();
      tracker.recordTrade();
      tracker.recordOwnerInteraction();
      tracker.recordError(new Error('Sample test error'));

      const stats = tracker.getStats();
      expect(stats.messagesExchanged).toBe(2);
      expect(stats.paymentsExecuted).toBe(1);
      expect(stats.tradesCompleted).toBe(1);
      expect(stats.ownerInteractions).toBe(1);
      expect(stats.errorsEncountered).toBe(1);

      const report = tracker.formatReport();
      expect(report).toContain('BIZARRE CAFE SIMULATION SUMMARY REPORT');
      expect(report).toContain('Messages Exchanged: 2');
      expect(report).toContain('Payments Executed:  1');
      expect(report).toContain('Trades Completed:   1');
      expect(report).toContain('Owner Lore Events:  1');
      expect(report).toContain('Errors Encountered: 1');
    });
  });

  describe('runSimulation integration', () => {
    it('should gracefully report error if health check fails when server is unreachable', async () => {
      const stats = await runSimulation({
        baseUrl: 'http://127.0.0.1:59999', // Non-existent port
        durationMs: 100,
        skipHealthCheck: false,
        standalone: false,
        maxHealthAttempts: 2,
        healthRetryDelayMs: 20,
      });

      expect(stats.errorsEncountered).toBeGreaterThan(0);
    });

    it('should execute end-to-end multi-agent simulation with live server', async () => {
      const { serve } = await import('@hono/node-server');
      const { default: app } = await import('../src/index');
      const testPort = 3198;
      const server = serve({ fetch: app.fetch, port: testPort });

      try {
        const stats = await runSimulation({
          baseUrl: `http://127.0.0.1:${testPort}`,
          durationMs: 1200,
          turnDelayMs: 40,
          maxHealthAttempts: 5,
          healthRetryDelayMs: 50,
        });

        expect(stats.durationSeconds).toBeGreaterThanOrEqual(1);
        expect(stats.messagesExchanged).toBeGreaterThanOrEqual(3);
      } finally {
        server.close();
      }
    });
  });
});
