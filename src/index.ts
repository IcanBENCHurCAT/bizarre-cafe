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
import { powered } from 'hono/powered-by';

import { config } from './config';
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
app.use('*', powered());

// Health check
app.get('/health', (c) => c.json({ status: 'ok', version: '0.1.0' }));

// SSE endpoint (real-time chat)
app.get('/sse', sseHandler);

// Authenticated routes (requires x402 wallet signature)
app.use('/api/*', authMiddleware);
app.use('/api/*', circuitBreaker);

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
app.use('/api/*', rateLimiter);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.info('SIGTERM received, shutting down gracefully…');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.info('SIGINT received, shutting down gracefully…');
  process.exit(0);
});

// Export for Cloud Run / serverless
export default app;
