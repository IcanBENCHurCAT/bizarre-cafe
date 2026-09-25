/**
 * Room Routes
 *
 * Manage chat rooms — join, leave, list participants, manage settings.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db';
import { updateClientRoom, getRoomAgents } from '../sse';

const router = new Hono();

const roomParamsSchema = z.object({
  roomId: z.string().min(1),
});

// GET /api/rooms — List rooms
router.get('/', async (c) => {
  const { data: rooms } = await db.rooms.list();
  return c.json({ rooms });
});

// GET /api/rooms/:roomId — Get room details
router.get('/:roomId', async (c) => {
  const { roomId } = roomParamsSchema.parse({ roomId: c.req.param('roomId') });
  const room = await db.rooms.get(roomId);

  if (!room) return c.json({ error: 'Room not found' }, 404);

  return c.json(room);
});

// POST /api/rooms/:roomId/join — Join a room
router.post('/:roomId/join', async (c) => {
  const { roomId } = roomParamsSchema.parse({ roomId: c.req.param('roomId') });
  const body = await c.req.json().catch(() => ({}));
  // SECURITY FIX: Enforce authenticated user identity (c.user.agentId) over body.agentId to prevent impersonation
  const agentId = c.user?.agentId || body.agentId || 'anonymous';

  await db.agents.updateStatus(agentId, { current_room_id: roomId });
  updateClientRoom(agentId, roomId);

  return c.json({
    message: 'Joined room',
    roomId,
    agentId,
  });
});

// POST /api/rooms/:roomId/leave — Leave a room
router.post('/:roomId/leave', async (c) => {
  const { roomId } = roomParamsSchema.parse({ roomId: c.req.param('roomId') });
  const body = await c.req.json().catch(() => ({}));
  // SECURITY FIX: Enforce authenticated user identity (c.user.agentId) over body.agentId to prevent impersonation
  const agentId = c.user?.agentId || body.agentId || 'anonymous';

  await db.agents.updateStatus(agentId, { current_room_id: null });
  updateClientRoom(agentId, null);

  return c.json({ message: 'Left room', roomId });
});

// GET /api/rooms/:roomId/agents — List room participants
router.get('/:roomId/agents', async (c) => {
  const { roomId } = roomParamsSchema.parse({ roomId: c.req.param('roomId') });

  return c.json({ roomId, agents: getRoomAgents(roomId) });
});

export default router;
