import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sqliteDb,
  createSqliteTrade,
  getSqliteTradeById,
  updateSqliteTrade,
  createSqliteEscrowRecord,
  getSqliteEscrowRecord,
  updateSqliteEscrowRecord,
} from '../src/db/sqlite';
import type { PaginationData } from '../src/db';

describe('DatabaseAdapter', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('db adapter selection based on config.useLocalDb', () => {
    it('selects sqliteDb when config.useLocalDb is true', async () => {
      vi.doMock('../src/config', () => ({
        config: {
          useLocalDb: true,
          databaseUrl: 'sqlite.db',
        },
      }));

      const { sqliteDb } = await import('../src/db/sqlite');
      const { db } = await import('../src/db/index');
      expect(db).toBe(sqliteDb);
    });

    it('selects supabaseDb when config.useLocalDb is false', async () => {
      vi.doMock('../src/config', () => ({
        config: {
          useLocalDb: false,
          databaseUrl: 'sqlite.db',
        },
      }));

      const { supabaseDb } = await import('../src/db/supabase');
      const { db } = await import('../src/db/index');
      expect(db).toBe(supabaseDb);
    });
  });

  describe('sqliteDb rooms.list', () => {
    it('returns rooms list with typed pagination object', async () => {
      const { sqliteDb } = await import('../src/db/sqlite');
      const result = await sqliteDb.rooms.list({ limit: 10, offset: 0 });
      expect(result).toHaveProperty('data');
      expect(Array.isArray(result.data)).toBe(true);
      expect(result).toHaveProperty('pagination');

      const pagination: PaginationData = result.pagination;
      expect(typeof pagination.total).toBe('number');
      expect(typeof pagination.offset).toBe('number');
      expect(typeof pagination.limit).toBe('number');
      expect(typeof pagination.hasMore).toBe('boolean');
      expect(pagination.offset).toBe(0);
      expect(pagination.limit).toBe(10);
    });
  });

  describe('updateSqliteTrade security & behavior', () => {
    it('updates trade correctly without vulnerability to SQL injection', async () => {
      const created = await createSqliteTrade({
        from_agent_id: 'agent_1',
        to_user_id: 'user_1',
        status: 'pending',
        notes: 'Initial note',
      });

      const sqlInjectionPayload = "test' WHERE 1=1; --";
      await updateSqliteTrade(created.id, {
        status: 'completed',
        notes: sqlInjectionPayload,
      });

      const updated = await getSqliteTradeById(created.id);
      expect(updated).not.toBeNull();
      expect(updated?.status).toBe('completed');
      expect(updated?.notes).toBe(sqlInjectionPayload);
    });
  });

  describe('updateSqliteEscrowRecord security & behavior', () => {
    it('updates escrow record correctly without vulnerability to SQL injection', async () => {
      const record = {
        id: `escrow_${Date.now()}`,
        tradeId: `trade_${Date.now()}`,
        buyerAgentId: 'buyer_1',
        sellerAgentId: 'seller_1',
        amountMicroAlgos: 1000,
        txId: 'tx_123',
        status: 'locked' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await createSqliteEscrowRecord(record);

      const sqlInjectionPayload = "released' OR '1'='1";
      await updateSqliteEscrowRecord(record.id, {
        status: sqlInjectionPayload as any,
        releasedAt: new Date().toISOString(),
      });

      const updated = await getSqliteEscrowRecord(record.id);
      expect(updated).not.toBeNull();
      expect(updated?.status).toBe(sqlInjectionPayload);
      expect(updated?.releasedAt).toBeDefined();
    });
  });
});
