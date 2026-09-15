import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Production Caddyfile Configuration', () => {
  const caddyfilePath = path.resolve(__dirname, '../Caddyfile');

  it('should exist and be readable', () => {
    expect(fs.existsSync(caddyfilePath)).toBe(true);
    const content = fs.readFileSync(caddyfilePath, 'utf8');
    expect(content.length).toBeGreaterThan(0);
  });

  it('should disable admin API for security hardening', () => {
    const content = fs.readFileSync(caddyfilePath, 'utf8');
    expect(content).toMatch(/admin\s+off/);
  });

  it('should configure domain with DuckDNS fallback', () => {
    const content = fs.readFileSync(caddyfilePath, 'utf8');
    expect(content).toContain('{$DOMAIN:{$DUCKDNS_SUBDOMAIN:bizarre-cafe}.duckdns.org}');
  });

  it('should configure gzip and zstd encoding', () => {
    const content = fs.readFileSync(caddyfilePath, 'utf8');
    expect(content).toMatch(/encode\s+gzip\s+zstd/);
  });

  it('should include strict production security headers', () => {
    const content = fs.readFileSync(caddyfilePath, 'utf8');
    expect(content).toContain('Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"');
    expect(content).toContain('X-Content-Type-Options "nosniff"');
    expect(content).toContain('X-Frame-Options "DENY"');
    expect(content).toContain('Referrer-Policy "strict-origin-when-cross-origin"');
    expect(content).toContain('-Server');
  });

  it('should reverse proxy to app:8080 with zero-buffering flush_interval -1 for real-time SSE streaming', () => {
    const content = fs.readFileSync(caddyfilePath, 'utf8');
    expect(content).toMatch(/reverse_proxy\s+app:8080\s*\{[\s\S]*?flush_interval\s+-1[\s\S]*?\}/);
  });
});
