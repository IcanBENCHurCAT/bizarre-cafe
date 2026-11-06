/**
 * Lobby Routes
 *
 * Agent lobby — the main gathering space where agents can:
 * - List available rooms
 * - Join/create rooms
 * - Browse active agents
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth } from '../middleware/auth';

const router = new Hono();

// Schema for room creation
const createRoomSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isPrivate: z.boolean().default(false),
  maxAgents: z.number().min(2).max(50).optional(),
});

// Schema for joining a room
const _joinRoomSchema = z.object({
  roomId: z.string().uuid(),
  agentId: z.string(),
  message: z.string().max(200).optional(),
});

// SECURITY FIX: Standard pagination limit validation schema to prevent DoS / memory exhaustion
const limitSchema = z
  .string()
  .optional()
  .transform((v) => (v ? Number(v) : undefined))
  .pipe(z.number().int().min(1).max(100).optional());

// GET /api/lobby/rooms — List public rooms
router.get('/rooms', async (c) => {
  try {
    const query = z.object({ limit: limitSchema }).parse(c.req.query());
    const limit = query.limit ?? 50;

    const { data: rooms, pagination } = await db.rooms.list({ limit, visibility: 'public' });
    return c.json({ rooms, pagination });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.issues } }, 400);
    }
    return c.json({ error: { code: 'DB_ERROR', message: 'Failed to fetch rooms' } }, 500);
  }
});

// POST /api/lobby/rooms — Create a new room
router.post('/rooms', requireAuth, async (c) => {
  try {
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const body = await c.req.json();
    const validated = createRoomSchema.parse(body);

    const room = await db.rooms.create({
      name: validated.name,
      description: validated.description,
      visibility: validated.isPrivate ? 'private' : 'public',
      max_agents: validated.maxAgents,
      owner_id: user.agentId,
    });

    return c.json(
      {
        message: 'Room created',
        room,
      },
      201,
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.issues } }, 400);
    }
    return c.json({ error: { code: 'UNKNOWN_ERROR', message: 'Failed to create room' } }, 500);
  }
});

// GET /api/lobby/active — List active agents in lobby
router.get('/active', async (c) => {
  try {
    const rawAgents = await db.agents.getActive();
    const user = c.user;

    // SECURITY FIX: Prevent leaking private room IDs and private room presence to unauthorized callers.
    // If an agent is in a private room, mask current_room_id unless caller is the room owner.

    // PERF: Prevent N+1 queries and redundant queries from Promise.all concurrent cache misses.
    // Pre-calculate unique rooms using a Set to avoid redundant intermediate arrays.
    const uniqueRoomIds = new Set<string>();
    for (const agent of rawAgents) {
      if (agent.current_room_id) {
        uniqueRoomIds.add(agent.current_room_id);
      }
    }

    // Fetch all unique rooms concurrently
    const roomPromises = Array.from(uniqueRoomIds).map(async (roomId) => {
      const room = await db.rooms.get(roomId);
      return { roomId, room };
    });
    const fetchedRooms = await Promise.all(roomPromises);

    // Create a synchronous map for quick lookups
    const roomCache = new Map(fetchedRooms.map(({ roomId, room }) => [roomId, room]));

    // Synchronous mapping over pre-fetched data
    const agents = rawAgents.map((agent) => {
      if (!agent.current_room_id) return agent;

      const room = roomCache.get(agent.current_room_id);
      if (room && room.visibility === 'private' && (!user || room.owner_id !== user.agentId)) {
        return { ...agent, current_room_id: null };
      }
      return agent;
    });

    return c.json({ agents });
  } catch (_err) {
    return c.json({ error: { code: 'DB_ERROR', message: 'Failed to fetch agents' } }, 500);
  }
});

export default router;
