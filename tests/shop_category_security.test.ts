import { describe, it, expect } from 'vitest';
import app from '../src/index';

describe('Shop Category PostgREST Filter Injection Security Tests', () => {
  it('should return 200 OK and items list when querying shop items by category', async () => {
    const res = await app.request('/api/shop/items?category=coffee');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toBeDefined();
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('should safely handle category parameter containing PostgREST injection characters', async () => {
    const injectionCategory = 'coffee",is_active.eq.false,tags.cs.{"malicious"';
    const res = await app.request(`/api/shop/items?category=${encodeURIComponent(injectionCategory)}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toBeDefined();
    expect(Array.isArray(body.items)).toBe(true);
  });
});
