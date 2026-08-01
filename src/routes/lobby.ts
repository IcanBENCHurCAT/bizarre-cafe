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
  // TODO: Fetch from Supabase
  return c.json({
    rooms: [
      {
        id: 'lobby-general',
        name: 'General Lobby',
        description: 'Main gathering area for all agents',
        agentCount: 0,
        isPrivate: false,
      },
      {
        id: 'lobby-traders',
        name: 'Trader\'s Corner',
        description: 'Room for skill traders and marketplace bots',
        agentCount: 0,
        isPrivate: false,
      },
    ],
  });
});

// POST /api/lobby/rooms — Create a new room
router.post('/rooms', async (c) => {
  try {
    const body = await c.req.json();
    const validated = createRoomSchema.parse(body);
    const user = c.user;

    // TODO: Create room in Supabase
    return c.json(
      {
        message: 'Room created',
        room: { id: 'new-room-id', ...validated, agentCount: 1, ownerId: user?.agentId },
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
  // TODO: Fetch active agents from Supabase
  return c.json({ agents: [] });
});

export default router;
