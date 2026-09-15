import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';

describe('OCI Deployment Workflow (.github/workflows/deploy.yml)', () => {
  const workflowPath = path.resolve(__dirname, '../.github/workflows/deploy.yml');

  it('should exist and parse as valid YAML', () => {
    expect(fs.existsSync(workflowPath)).toBe(true);
    const content = fs.readFileSync(workflowPath, 'utf8');
    const parsed = yaml.load(content) as Record<string, any>;
    expect(parsed).toBeDefined();
    expect(typeof parsed).toBe('object');
  });

  it('should trigger on push to main, master, and workflow_dispatch', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    const parsed = yaml.load(content) as any;

    expect(parsed.name).toBe('Build & Deploy Bizarre Cafe to OCI');
    expect(parsed.on).toBeDefined();
    expect(parsed.on.push).toBeDefined();
    expect(parsed.on.push.branches).toEqual(expect.arrayContaining(['main', 'master']));
    expect(parsed.on.workflow_dispatch).toBeDefined();
  });

  it('should specify required permissions and registry environment variables', () => {
    const content = fs.readFileSync(workflowPath, 'utf8');
    const parsed = yaml.load(content) as any;

    expect(parsed.permissions).toEqual({
      contents: 'read',
      packages: 'write',
    });
    expect(parsed.env).toBeDefined();
    expect(parsed.env.REGISTRY).toBe('ghcr.io');
    expect(parsed.env.IMAGE_NAME).toBe('${{ github.repository }}');
  });

  describe('build-and-push job', () => {
    it('should configure multi-arch QEMU, Buildx, GHCR login, and GHA caching', () => {
      const content = fs.readFileSync(workflowPath, 'utf8');
      const parsed = yaml.load(content) as any;
      const job = parsed.jobs['build-and-push'];

      expect(job).toBeDefined();
      expect(job['runs-on']).toBe('ubuntu-latest');

      const steps = job.steps;
      expect(Array.isArray(steps)).toBe(true);

      // Checkout
      const checkoutStep = steps.find((s: any) => s.uses?.startsWith('actions/checkout'));
      expect(checkoutStep).toBeDefined();

      // QEMU
      const qemuStep = steps.find((s: any) => s.uses?.startsWith('docker/setup-qemu-action'));
      expect(qemuStep).toBeDefined();
      expect(qemuStep.uses).toContain('@v3');

      // Buildx
      const buildxStep = steps.find((s: any) => s.uses?.startsWith('docker/setup-buildx-action'));
      expect(buildxStep).toBeDefined();
      expect(buildxStep.uses).toContain('@v3');

      // Login
      const loginStep = steps.find((s: any) => s.uses?.startsWith('docker/login-action'));
      expect(loginStep).toBeDefined();
      expect(loginStep.with.registry).toBe('${{ env.REGISTRY }}');
      expect(loginStep.with.username).toBe('${{ github.actor }}');

      // Metadata
      const metaStep = steps.find((s: any) => s.uses?.startsWith('docker/metadata-action'));
      expect(metaStep).toBeDefined();
      expect(metaStep.with.images).toBe('${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}');
      expect(metaStep.with.tags).toContain('latest');
      expect(metaStep.with.tags).toContain('sha-');

      // Build and push
      const buildPushStep = steps.find((s: any) => s.uses?.startsWith('docker/build-push-action'));
      expect(buildPushStep).toBeDefined();
      expect(buildPushStep.with.platforms).toBe('linux/amd64,linux/arm64');
      expect(buildPushStep.with.push).toBe(true);
      expect(buildPushStep.with['cache-from']).toBe('type=gha');
      expect(buildPushStep.with['cache-to']).toBe('type=gha,mode=max');
    });
  });

  describe('deploy job', () => {
    it('should depend on build-and-push and configure HOST environment', () => {
      const content = fs.readFileSync(workflowPath, 'utf8');
      const parsed = yaml.load(content) as any;
      const job = parsed.jobs.deploy;

      expect(job).toBeDefined();
      expect(job.needs).toBe('build-and-push');
      expect(job['runs-on']).toBe('ubuntu-latest');
      expect(job.env.HOST).toBe('${{ secrets.OCI_VM_HOST }}');
    });

    it('should gracefully skip when HOST is not configured', () => {
      const content = fs.readFileSync(workflowPath, 'utf8');
      const parsed = yaml.load(content) as any;
      const steps = parsed.jobs.deploy.steps;

      const skipStep = steps.find((s: any) => s.if === "env.HOST == ''");
      expect(skipStep).toBeDefined();
      expect(skipStep.run).toContain('Skipping VM deployment');
    });

    it('should use appleboy/scp-action and appleboy/ssh-action to deploy to /opt/bizarre-cafe', () => {
      const content = fs.readFileSync(workflowPath, 'utf8');
      const parsed = yaml.load(content) as any;
      const steps = parsed.jobs.deploy.steps;

      // SCP step
      const scpStep = steps.find((s: any) => s.uses?.startsWith('appleboy/scp-action'));
      expect(scpStep).toBeDefined();
      expect(scpStep.with.target).toBe('/opt/bizarre-cafe');
      expect(scpStep.with.source).toContain('docker-compose.prod.yml');
      expect(scpStep.with.source).toContain('Caddyfile');

      // SSH steps
      const sshSteps = steps.filter((s: any) => s.uses?.startsWith('appleboy/ssh-action'));
      expect(sshSteps.length).toBeGreaterThanOrEqual(2);

      // Verify directory preparation & ghcr login
      const prepStep = sshSteps.find((s: any) => s.with.script?.includes('/opt/bizarre-cafe'));
      expect(prepStep).toBeDefined();

      // Verify stack reload & .env synthesis
      const reloadStep = steps.find((s: any) => s.name === 'Reload Stack on VM');
      expect(reloadStep).toBeDefined();
      expect(reloadStep.with.script).toContain('docker-compose.prod.yml');
      expect(reloadStep.with.script).toContain('cat << EOF > .env');
      expect(reloadStep.with.script).toContain('JWT_SECRET');
      expect(reloadStep.with.script).toContain('DOMAIN');
    });

    it('should execute automated healthcheck retry loop probing /health with 12 retries and 5s delay', () => {
      const content = fs.readFileSync(workflowPath, 'utf8');
      const parsed = yaml.load(content) as any;
      const steps = parsed.jobs.deploy.steps;

      const healthcheckStep = steps.find((s: any) => s.name?.includes('Healthcheck'));
      expect(healthcheckStep).toBeDefined();
      expect(healthcheckStep.run).toContain('MAX_RETRIES=12');
      expect(healthcheckStep.run).toContain('DELAY=5');
      expect(healthcheckStep.run).toContain('https://${DOMAIN}/health');
      expect(healthcheckStep.run).toContain('HTTP_STATUS');
      expect(healthcheckStep.run).toContain('"200"');
      expect(healthcheckStep.run).toContain('exit 1');
    });
  });
});
