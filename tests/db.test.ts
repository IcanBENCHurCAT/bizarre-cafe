import { describe, it, expect } from 'vitest';
import { sqliteDb } from '../src/db/sqlite';
import type { PaginationData } from '../src/db';

describe('DatabaseAdapter', () => {
  describe('sqliteDb rooms.list', () => {
    it('returns rooms list with typed pagination object', async () => {
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
