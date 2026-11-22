import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as yamlModule from 'js-yaml';
import app, { shouldStartServer } from '../src/index';

const yaml: any = (yamlModule as any).load
  ? yamlModule
  : ((yamlModule as any).default ?? yamlModule);

describe('Production Server Startup Guard', () => {
  const indexPath = path.resolve(__dirname, '../src/index.ts');
  const indexUrl = pathToFileURL(indexPath).href;

  describe('shouldStartServer', () => {
    it('returns true when NODE_ENV=production and argv1 resolves to moduleUrl (without START_SERVER)', () => {
      const env = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;
      expect(shouldStartServer(env, indexPath, indexUrl)).toBe(true);
      expect(shouldStartServer(env, fileURLToPath(import.meta.url), import.meta.url)).toBe(true);
    });

    it('returns true when START_SERVER=true even with NODE_ENV=production and mismatched argv1', () => {
      const env = {
        NODE_ENV: 'production',
        START_SERVER: 'true',
      } as NodeJS.ProcessEnv;
      expect(shouldStartServer(env, '/some/other/entrypoint.js', indexUrl)).toBe(true);
    });

    it('returns false when START_SERVER=false even if argv1 matches moduleUrl', () => {
      const env = {
        NODE_ENV: 'production',
        START_SERVER: 'false',
      } as NodeJS.ProcessEnv;
      expect(shouldStartServer(env, indexPath, indexUrl)).toBe(false);
    });

    it('returns false under Vitest (NODE_ENV=test or VITEST=true) unless START_SERVER=true', () => {
      expect(
        shouldStartServer({ NODE_ENV: 'test' } as NodeJS.ProcessEnv, indexPath, indexUrl),
      ).toBe(false);
      expect(
        shouldStartServer(
          { NODE_ENV: 'production', VITEST: 'true' } as NodeJS.ProcessEnv,
          indexPath,
          indexUrl,
        ),
      ).toBe(false);
      expect(
        shouldStartServer(
          { NODE_ENV: 'test', VITEST: 'true', START_SERVER: 'true' } as NodeJS.ProcessEnv,
          indexPath,
          indexUrl,
        ),
      ).toBe(true);
    });

    it('returns false when imported by another entrypoint (argv1 differs) or argv1 is missing', () => {
      const env = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;
      expect(shouldStartServer(env, path.resolve(__dirname, '../scripts/simulate-agents.ts'), indexUrl)).toBe(false);
      expect(shouldStartServer(env, undefined, indexUrl)).toBe(false);
    });

    it('returns false safely if moduleUrl is invalid', () => {
      const env = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;
      expect(shouldStartServer(env, indexPath, 'not-a-valid-file-url')).toBe(false);
    });
  });

  describe('Deployment configuration manifests', () => {
    it('Dockerfile sets ENV START_SERVER=true alongside ENV NODE_ENV=production', () => {
      const dockerfile = fs.readFileSync(path.resolve(__dirname, '../Dockerfile'), 'utf8');
      expect(dockerfile).toMatch(/ENV\s+NODE_ENV=production/);
      expect(dockerfile).toMatch(/ENV\s+START_SERVER=true/);
    });

    it('docker-compose.prod.yml configures START_SERVER=true alongside NODE_ENV=production', () => {
      const composePath = path.resolve(__dirname, '../docker-compose.prod.yml');
      const compose = yaml.load(fs.readFileSync(composePath, 'utf8')) as any;
      const appEnv: string[] = compose?.services?.app?.environment ?? [];
      expect(appEnv).toContain('NODE_ENV=production');
      expect(appEnv).toContain('START_SERVER=true');
    });

    it('.github/workflows/deploy.yml writes START_SERVER=true in the .env heredoc alongside NODE_ENV=production', () => {
      const workflowPath = path.resolve(__dirname, '../.github/workflows/deploy.yml');
      const workflowContent = fs.readFileSync(workflowPath, 'utf8');
      expect(workflowContent).toMatch(/NODE_ENV=production\r?\n\s*START_SERVER=true/);
    });
  });

  describe('Health endpoint availability', () => {
    it('app.request("/health") returns 200', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);
    });
  });
});
