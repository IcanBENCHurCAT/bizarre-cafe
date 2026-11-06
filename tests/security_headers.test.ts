import { describe, it, expect } from 'vitest';
import app from '../src/index';

describe('Security Headers - Information Exposure Mitigation', () => {
  it('should not leak X-Powered-By header on GET /health', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  it('should not leak X-Powered-By header on API routes (GET /api/lobby/rooms)', async () => {
    const res = await app.request('/api/lobby/rooms');
    expect(res.status).toBe(200);
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  it('should include secureHeaders (e.g. X-Content-Type-Options: nosniff)', async () => {
    const res = await app.request('/health');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
