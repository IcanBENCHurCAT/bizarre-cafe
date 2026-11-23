import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as yamlModule from 'js-yaml';
import ts from 'typescript';
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

  describe('NodeNext ESM build & import compliance', () => {
    function collectTsFiles(dir: string): string[] {
      const files: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...collectTsFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
          files.push(fullPath);
        }
      }
      return files;
    }

    it('tsconfig.json configures module and moduleResolution as NodeNext', () => {
      const tsconfigPath = path.resolve(__dirname, '../tsconfig.json');
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
      expect(tsconfig.compilerOptions?.module).toBe('NodeNext');
      expect(tsconfig.compilerOptions?.moduleResolution).toBe('NodeNext');
    });

    it('every relative import/export across src/**/*.ts uses an explicit .js extension', () => {
      const srcDir = path.resolve(__dirname, '../src');
      const files = collectTsFiles(srcDir);
      expect(files.length).toBeGreaterThan(0);

      const violations: string[] = [];
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
        const visit = (node: ts.Node): void => {
          if (
            (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)
          ) {
            const specifier = node.moduleSpecifier.text;
            if ((specifier.startsWith('./') || specifier.startsWith('../')) && !specifier.endsWith('.js')) {
              const relFile = path.relative(srcDir, file).replace(/\\/g, '/');
              violations.push(`${relFile}: ${specifier}`);
            }
          }
          ts.forEachChild(node, visit);
        };
        visit(sourceFile);
      }

      expect(violations).toEqual([]);
    });

    it('.github/workflows/ci.yml includes the Smoke test built ESM entrypoint step for ./dist/index.js', () => {
      const ciPath = path.resolve(__dirname, '../.github/workflows/ci.yml');
      const ciConfig = yaml.load(fs.readFileSync(ciPath, 'utf8')) as any;
      const buildSteps: Array<{ name?: string; run?: string }> = ciConfig?.jobs?.build?.steps ?? [];
      const smokeStep = buildSteps.find((step) => step.name === 'Smoke test built ESM entrypoint');
      expect(smokeStep).toBeDefined();
      expect(smokeStep?.run).toContain('./dist/index.js');
    });
  });
});
