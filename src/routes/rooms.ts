/**
 * Room Routes
 *
 * Manage chat rooms — join, leave, list participants, manage settings.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db';
import { updateClientRoom, getRoomAgents } from '../sse';
import { requireAuth } from '../middleware/auth';

const router = new Hono();

const roomParamsSchema = z.object({
  roomId: z.string().min(1),
});

// SECURITY FIX: Standard pagination limit validation schema to prevent DoS / memory exhaustion
const limitSchema = z
  .string()
  .optional()
  .transform((v) => (v ? Number(v) : undefined))
  .pipe(z.number().int().min(1).max(100).optional());

// GET /api/rooms — List rooms
router.get('/', async (c) => {
  try {
    const query = z.object({ limit: limitSchema }).parse(c.req.query());
    const limit = query.limit ?? 50;

    const { data: allRooms } = await db.rooms.list({ limit });
    const user = c.user;

    // SECURITY FIX: Filter out private rooms unless caller is the room owner
    const rooms = allRooms.filter((room) => {
      if (room.visibility === 'private') {
        return Boolean(user && room.owner_id && room.owner_id === user.agentId);
      }
      return true;
    });

    return c.json({ rooms });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json({ error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch rooms' } }, 500);
  }
});

// GET /api/rooms/:roomId — Get room details
router.get('/:roomId', requireAuth, async (c) => {
  const { roomId } = roomParamsSchema.parse({ roomId: c.req.param('roomId') });
  const room = await db.rooms.get(roomId);

  if (!room) return c.json({ error: 'Room not found' }, 404);

  // SECURITY FIX: Enforce authorization for private rooms (IDOR protection)
  if (room.visibility === 'private') {
    const user = c.user;
    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }
    if (room.owner_id !== user.agentId) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403);
    }
  }

  return c.json(room);
});

// POST /api/rooms/:roomId/join — Join a room
router.post('/:roomId/join', requireAuth, async (c) => {
  const { roomId } = roomParamsSchema.parse({ roomId: c.req.param('roomId') });
  const body = await c.req.json().catch(() => ({}));

  // SECURITY FIX: Enforce private room authorization check
  const room = await db.rooms.get(roomId);
  if (room && room.visibility === 'private') {
    const user = c.user;
    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }
    if (room.owner_id !== user.agentId) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403);
    }
  }

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
router.post('/:roomId/leave', requireAuth, async (c) => {
  const { roomId } = roomParamsSchema.parse({ roomId: c.req.param('roomId') });
  const body = await c.req.json().catch(() => ({}));

  // SECURITY FIX: Enforce private room authorization check
  const room = await db.rooms.get(roomId);
  if (room && room.visibility === 'private') {
    const user = c.user;
    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }
    if (room.owner_id !== user.agentId) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403);
    }
  }

  // SECURITY FIX: Enforce authenticated user identity (c.user.agentId) over body.agentId to prevent impersonation
  const agentId = c.user?.agentId || body.agentId || 'anonymous';

  await db.agents.updateStatus(agentId, { current_room_id: null });
  updateClientRoom(agentId, null);

  return c.json({ message: 'Left room', roomId, agentId });
});

// GET /api/rooms/:roomId/agents — List room participants
router.get('/:roomId/agents', requireAuth, async (c) => {
  const { roomId } = roomParamsSchema.parse({ roomId: c.req.param('roomId') });

  // SECURITY FIX: Enforce private room authorization check
  const room = await db.rooms.get(roomId);
  if (room && room.visibility === 'private') {
    const user = c.user;
    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }
    if (room.owner_id !== user.agentId) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Access denied' } }, 403);
    }
  }

  return c.json({ roomId, agents: getRoomAgents(roomId) });
});

export default router;
