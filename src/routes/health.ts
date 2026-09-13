import { Hono } from 'hono';
import { getHealthDiagnostics } from '../services/health';

const healthRouter = new Hono();

/**
 * GET /health
 * Returns comprehensive subsystem health diagnostics, memory metrics, and uptime.
 */
healthRouter.get('/', async (c) => {
  const diagnostics = await getHealthDiagnostics();
  return c.json(diagnostics, 200);
});

export default healthRouter;
