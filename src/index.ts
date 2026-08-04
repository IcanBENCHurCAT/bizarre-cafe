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

import { authMiddleware } from './middleware/auth';
import { rateLimiter } from './middleware/rateLimiter';
import { circuitBreaker } from './middleware/circuitBreaker';

// Routes
import lobbyRouter from './routes/lobby';
import roomsRouter from './routes/rooms';
import chatRouter from './routes/chat';
import shopRouter from './routes/shop';
import skillSwapRouter from './routes/skill-swap';
import ownerRouter from './routes/owner';
import eventsRouter from './routes/events';
import verificationRouter from './routes/verification';

// SSE handler
import { sseHandler } from './sse';

// --- App ---
const app = new Hono();

// Global middleware
app.use('*', logger());
app.use('*', cors());
app.use('*', secureHeaders());
app.use('*', poweredBy());

// Health check
app.get('/health', (c) => c.json({ status: 'ok', version: '0.1.0' }));

// SSE endpoint (real-time chat)
app.get('/sse', sseHandler);

// Authenticated routes (requires x402 wallet signature)
app.use('/api/*', authMiddleware);
app.use('/api/*', circuitBreaker());

// Route mounts
app.route('/api/lobby', lobbyRouter);
app.route('/api/rooms', roomsRouter);
app.route('/api/chat', chatRouter);
app.route('/api/shop', shopRouter);
app.route('/api/skill-swap', skillSwapRouter);
app.route('/api/owner', ownerRouter);
app.route('/api/events', eventsRouter);
app.route('/api/verification', verificationRouter);

// Rate limiting on all API routes
app.use('/api/*', rateLimiter());

// Graceful shutdown
process.on('SIGTERM', () => {
  console.info('SIGTERM received, shutting down gracefully…');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.info('SIGINT received, shutting down gracefully…');
  process.exit(0);
});

import { serve } from '@hono/node-server';
import { OwnerCronService } from './services/owner_cron';

// Start server if running directly (e.g. local dev)
if (process.env.NODE_ENV !== 'production' || process.env.START_SERVER === 'true') {
  console.log(`Starting local server on port ${config.port}`);
  OwnerCronService.start();
  serve({
    fetch: app.fetch,
    port: config.port
  });
}

// Export for Cloud Run / serverless
export default app;
