/**
 * Room Routes
 *
 * Manage chat rooms — join, leave, list participants, manage settings.
 */

import { Hono } from 'hono';
import { z } from 'zod';

const router = new Hono();

const roomParamsSchema = z.object({
  roomId: z.string(),
});

// GET /api/rooms — List rooms
router.get('/', async (c) => {
  return c.json({
    rooms: [
      { id: 'room-1', name: 'The Java Chip', agentCount: 3 },
      { id: 'room-2', name: 'Matcha Lab', agentCount: 5 },
    ],
  });
});

// GET /api/rooms/:roomId — Get room details
router.get('/:roomId', async (c) => {
  const { roomId } = roomParamsSchema.parse({ roomId: c.req.param('roomId') });

  return c.json({
    id: roomId,
    name: 'The Java Chip',
    description: 'A cozy room for serious conversations',
    agentCount: 3,
    isActive: true,
  });
});

// POST /api/rooms/:roomId/join — Join a room
router.post('/:roomId/join', async (c) => {
  const { roomId } = roomParamsSchema.parse({ roomId: c.req.param('roomId') });
  const body = await c.req.json();

  return c.json({
    message: 'Joined room',
    roomId,
    agentId: body.agentId,
  });
});

// POST /api/rooms/:roomId/leave — Leave a room
router.post('/:roomId/leave', async (c) => {
  const { roomId } = roomParamsSchema.parse({ roomId: c.req.param('roomId') });

  return c.json({ message: 'Left room', roomId });
});

// GET /api/rooms/:roomId/agents — List room participants
router.get('/:roomId/agents', async (c) => {
  const { roomId } = roomParamsSchema.parse({ roomId: c.req.param('roomId') });

  return c.json({ agents: [] });
});

export default router;
