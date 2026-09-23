import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sqliteDb,
  createSqliteEscrowRecord,
  getSqliteEscrowRecord,
  updateSqliteEscrowRecord,
  createSqliteTrade,
  getSqliteTradeById,
  updateSqliteTrade,
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

  describe('updateSqliteEscrowRecord & updateSqliteTrade security and functionality', () => {
    it('updates escrow record safely with parameterized fields', async () => {
      const id = 'escrow-test-id-1';
      await createSqliteEscrowRecord({
        id,
        tradeId: 'trade-1',
        buyerAgentId: 'buyer-1',
        sellerAgentId: 'seller-1',
        amountMicroAlgos: 1000,
        txId: 'tx-1',
        status: 'held',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const now = new Date().toISOString();
      await updateSqliteEscrowRecord(id, {
        status: 'released',
        releasedAt: now,
      });

      const record = await getSqliteEscrowRecord(id);
      expect(record).not.toBeNull();
      expect(record?.status).toBe('released');
      expect(record?.releasedAt).toBe(now);
    });

    it('ignores untrusted or non-whitelisted keys on updateSqliteEscrowRecord', async () => {
      const id = 'escrow-test-id-2';
      await createSqliteEscrowRecord({
        id,
        tradeId: 'trade-2',
        buyerAgentId: 'buyer-2',
        sellerAgentId: 'seller-2',
        amountMicroAlgos: 2000,
        txId: 'tx-2',
        status: 'held',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Attempting to pass unexpected properties that might try SQL injection or column manipulation
      const maliciousUpdates: any = {
        status: 'refunded',
        'invalid_col = 1; --': 'injected_value',
        unknownProp: 'ignored',
      };

      await updateSqliteEscrowRecord(id, maliciousUpdates);

      const record = await getSqliteEscrowRecord(id);
      expect(record?.status).toBe('refunded');
    });

    it('updates trade safely with parameterized fields', async () => {
      const id = 'trade-test-id-1';
      await createSqliteTrade({
        id,
        from_agent_id: 'agent-a',
        to_user_id: 'agent-b',
        status: 'offered',
        price_micro_algos: 500,
      });

      await updateSqliteTrade(id, {
        status: 'accepted',
        payment_status: 'settled',
        notes: 'Trade finished',
      });

      const trade = await getSqliteTradeById(id);
      expect(trade).not.toBeNull();
      expect(trade?.status).toBe('accepted');
      expect(trade?.paymentStatus).toBe('settled');
      expect(trade?.notes).toBe('Trade finished');
    });

    it('ignores untrusted or non-whitelisted keys on updateSqliteTrade', async () => {
      const id = 'trade-test-id-2';
      await createSqliteTrade({
        id,
        from_agent_id: 'agent-a',
        to_user_id: 'agent-b',
        status: 'offered',
      });

      const maliciousUpdates: any = {
        status: 'completed',
        'amount_micro_algos = 999999 --': 'injected',
      };

      await updateSqliteTrade(id, maliciousUpdates);

      const trade = await getSqliteTradeById(id);
      expect(trade?.status).toBe('completed');
      expect(trade?.priceMicroAlgos).toBe(0);
    });
  });
});
