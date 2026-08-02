import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve } from 'path';

describe('Project Setup', () => {
  it('should have package.json with required dependencies', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'));
    expect(pkg.name).toBe('bizarre-cafe');
    expect(pkg.dependencies).toHaveProperty('hono');
    expect(pkg.dependencies).toHaveProperty('x402');
    expect(pkg.dependencies).toHaveProperty('supabase');
    expect(pkg.dependencies).toHaveProperty('zod');
    expect(pkg.devDependencies).toHaveProperty('typescript');
    expect(pkg.devDependencies).toHaveProperty('vitest');
  });

  it('should have no phantom dependencies', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'));
    // These packages don't exist on npm or aren't imported in source
    expect(pkg.dependencies).not.toHaveProperty('ed25519-hypercore');
    expect(pkg.dependencies).not.toHaveProperty('uniregistro');
    expect(pkg.dependencies).not.toHaveProperty('algoliasearch');
  });

  it('should have .specify/spec.md', () => {
    const specPath = resolve(__dirname, '../.specify/spec.md');
    const content = readFileSync(specPath, 'utf-8');
    expect(content).toContain('Bizarre Cafe');
    expect(content).toContain('A2A');
  });

  it('should have supabase migrations', () => {
    const migrationPath = resolve(__dirname, '../supabase/migrations/001_initial_schema.sql');
    const content = readFileSync(migrationPath, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });

  it('should have src/index.ts', () => {
    const indexPath = resolve(__dirname, '../src/index.ts');
    const content = readFileSync(indexPath, 'utf-8');
    expect(content).toContain('Hono');
    expect(content).toContain('new Hono');
  });

  it('should have agent skills in .agents/', () => {
    const skillsDir = resolve(__dirname, '../.agents');
    const skills = readdirSync(skillsDir)
      .filter(f => statSync(resolve(skillsDir, f)).isDirectory());
    expect(skills.length).toBeGreaterThan(0);
  });
});
