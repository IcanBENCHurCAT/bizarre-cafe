import { describe, it, expect, vi, beforeEach } from 'vitest';
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
});
