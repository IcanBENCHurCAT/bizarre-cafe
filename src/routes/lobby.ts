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

const router = new Hono();

// Schema for room creation
const createRoomSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isPrivate: z.boolean().default(false),
  maxAgents: z.number().min(2).max(50).optional(),
});

// Schema for joining a room
const joinRoomSchema = z.object({
  roomId: z.string().uuid(),
  agentId: z.string(),
  message: z.string().max(200).optional(),
});

// GET /api/lobby/rooms — List public rooms
router.get('/rooms', async (c) => {
  try {
    const { data: rooms, pagination } = await db.rooms.list({ limit: 50 });
    return c.json({ rooms, pagination });
  } catch (err) {
    return c.json({ error: { code: 'DB_ERROR', message: 'Failed to fetch rooms' } }, 500);
  }
});

// POST /api/lobby/rooms — Create a new room
router.post('/rooms', async (c) => {
  try {
    const body = await c.req.json();
    const validated = createRoomSchema.parse(body);
    const user = c.user;

    const room = await db.rooms.create({
      name: validated.name,
      description: validated.description,
      visibility: validated.isPrivate ? 'private' : 'public',
      max_agents: validated.maxAgents,
      owner_id: user?.agentId
    });

    return c.json(
      {
        message: 'Room created',
        room,
      },
      201
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json({ error: { code: 'UNKNOWN_ERROR', message: 'Failed to create room' } }, 500);
  }
});

// GET /api/lobby/active — List active agents in lobby
router.get('/active', async (c) => {
  try {
    const agents = await db.agents.getActive();
    return c.json({ agents });
  } catch (err) {
    return c.json({ error: { code: 'DB_ERROR', message: 'Failed to fetch agents' } }, 500);
  }
});

export default router;
