/**
 * Bizarre Cafe — Main Hono entry point
 *
 * Serverless-ready API with Hono, serving:
 *  - REST endpoints for lobby, rooms, chat, shop, skill-swap, owner, events, verification
 *  - SSE streams for real-time chat
 *  - x402 payment middleware on paid routes
 */

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { poweredBy } from 'hono/powered-by';

import { config } from './config';
import { authMiddleware } from './middleware/auth';
import { rateLimiter } from './middleware/rateLimiter';
import { circuitBreaker } from './middleware/circuitBreaker';

// Routes
import healthRouter from './routes/health';
import lobbyRouter from './routes/lobby';
import roomsRouter from './routes/rooms';
import chatRouter from './routes/chat';
import shopRouter from './routes/shop';
import skillSwapRouter from './routes/skill-swap';
import ownerRouter from './routes/owner';
import eventsRouter from './routes/events';
import verificationRouter from './routes/verification';

// SSE handler
import { sseHandler, clearAllClients } from './sse';

// --- App ---
const app = new Hono();

// Global middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: config.corsAllowedOrigins,
    allowHeaders: [
      'Authorization',
      'Content-Type',
      'X-Agent-ID',
      'x-agent-id',
      'X-Agent-DID',
      'x-agent-did',
      'X-Agent-Signature',
      'x-agent-signature',
      'X-Agent-Nonce',
      'x-agent-nonce',
      'X-Agent-Timestamp',
      'x-agent-timestamp',
      'X-Room-ID',
      'x-room-id',
      'X-402-Payment',
      'x-x402-payment',
      'X-402-Receipt',
      'x-402-receipt',
      'X-Wallet-Sig',
      'X-Wallet-Address',
      'X-Wallet-Message',
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    exposeHeaders: ['Content-Length', 'X-Response-Time', 'X-402-Payment-Required'],
    credentials: true,
  }),
);
app.use('*', secureHeaders());
app.use('*', poweredBy());

// Health check diagnostics
app.route('/health', healthRouter);

// SSE endpoint (real-time chat)
app.get('/sse', sseHandler);

// Authenticated routes (requires x402 wallet signature)
app.use('/api/*', authMiddleware);
app.use('/api/*', circuitBreaker('api'));
app.use('/api/*', rateLimiter());

// Serve .well-known/agent.json for A2A discovery
app.get('/.well-known/agent.json', async (c) => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const filePath = path.join(process.cwd(), '.well-known', 'agent.json');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return c.json(JSON.parse(content));
  } catch {
    return c.json({ error: 'Agent card not found' }, 404);
  }
});

// Route mounts
app.route('/api/lobby', lobbyRouter);
app.route('/api/rooms', roomsRouter);
app.route('/api/chat', chatRouter);
app.route('/api/shop', shopRouter);
app.route('/api/skill-swap', skillSwapRouter);
app.route('/api/owner', ownerRouter);
app.route('/api/events', eventsRouter);
app.route('/api/verification', verificationRouter);

import { serve } from '@hono/node-server';
import { OwnerCronService } from './services/owner_cron';

// Active server handle for draining and graceful shutdown
let serverInstance: ReturnType<typeof serve> | null = null;

/**
 * Gracefully shuts down the running application:
 * 1. Stops autonomous Owner cron scheduler
 * 2. Drains and disconnects active SSE streaming clients
 * 3. Closes the HTTP server listener
 */
export async function gracefulShutdown(signal: string = 'SIGTERM'): Promise<void> {
  console.warn(`[shutdown] ${signal} received, draining connections and stopping services...`);
  OwnerCronService.stop();
  clearAllClients();
  if (serverInstance) {
    await new Promise<void>((resolve) => {
      serverInstance?.close(() => resolve());
    });
    serverInstance = null;
  }
  console.warn('[shutdown] Teardown complete.');
}

// Graceful shutdown listeners
process.on('SIGTERM', async () => {
  await gracefulShutdown('SIGTERM');
  process.exit(0);
});

process.on('SIGINT', async () => {
  await gracefulShutdown('SIGINT');
  process.exit(0);
});

// Start server if running directly (e.g. local dev)
if (process.env.NODE_ENV !== 'production' || process.env.START_SERVER === 'true') {
  console.warn(`Starting local server on port ${config.port}`);
  OwnerCronService.start();
  serverInstance = serve({
    fetch: app.fetch,
    port: config.port,
  });
}

// Export for Cloud Run / serverless
export default app;
