import { Hono } from 'hono';
import { getHealthDiagnostics } from '../services/health';

const healthRouter = new Hono();

/**
 * GET /health
 * Returns comprehensive subsystem health diagnostics, memory metrics, and uptime.
 */
healthRouter.get('/', async (c) => {
  const diagnostics = await getHealthDiagnostics();
  const statusCode = diagnostics.status === 'healthy' ? 200 : 503;
  return c.json(diagnostics, statusCode);
});

export default healthRouter;
