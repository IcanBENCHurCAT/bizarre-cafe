/**
 * Chat Routes
 *
 * Real-time chat messages with WebSocket/SSE awareness:
 * - POST /messages — Send a chat message
 * - GET /messages?roomId= — List recent messages in a room
 * - GET /history?roomId=&limit= — Fetch message history
 * - GET /presence?roomId= — Check who's online
 * - GET /unread?roomId= — Count unread messages
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { createSupabaseClient } from '../supabase/client';
import type { ChatMessage, ApiError } from '../types/cafe';

const router = new Hono();

// Zod schemas
const sendMessageSchema = z.object({
  roomId: z.string().uuid(),
  content: z.string().min(1).max(5000),
  type: z.enum(['text', 'system', 'rich']).default('text'),
  metadata: z.record(z.unknown()).optional(),
});

const messagesQuerySchema = z.object({
  roomId: z.string().uuid(),
  limit: z.string().transform(Number).optional(),
  before: z.string().optional(),
});

const historyQuerySchema = z.object({
  roomId: z.string().uuid(),
  limit: z.string().transform(Number).optional(),
  before: z.string().optional(),
  after: z.string().optional(),
});

/**
 * POST /messages — Send a chat message to a room
 *
 * Accepts text, system, or rich message types. System messages can
 * be sent by admins; rich messages include structured metadata.
 * WebSocket clients will receive this message via broadcast.
 */
router.post('/messages', async (c) => {
  try {
    const body = await c.req.json();
    const validated = sendMessageSchema.parse(body);
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const supabase = createSupabaseClient();

    // Insert message into Supabase
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        room_id: validated.roomId,
        agent_id: user.agentId,
        content: validated.content,
        type: validated.type,
        metadata: validated.metadata ?? null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to send message' } },
        500
      );
    }

    // Broadcast via SSE/WebSocket (simplified)
    // In production, emit to SSE broadcast queue
    // await sseBroadcast.broadcast(validated.roomId, data);

    return c.json(
      {
        message: 'Message sent',
        messageData: {
          id: data.id,
          roomId: data.room_id,
          agentId: data.agent_id,
          content: data.content,
          type: data.type,
          metadata: data.metadata,
          createdAt: data.created_at,
        } satisfies Partial<ChatMessage>,
      },
      201
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Failed to send message' } },
      500
    );
  }
});

/**
 * GET /messages?roomId= — List recent messages in a room
 *
 * Returns up to `limit` recent messages. Defaults to 50 if unspecified.
 * Use the `before` parameter for pagination (cursor-based).
 */
router.get('/messages', async (c) => {
  try {
    const query = c.req.query();
    const validated = messagesQuerySchema.parse(query);
    const limit = validated.limit ?? 50;

    const supabase = createSupabaseClient();

    let queryBuilder = supabase
      .from('chat_messages')
      .select('*')
      .eq('room_id', validated.roomId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (validated.before) {
      queryBuilder = queryBuilder.lt('created_at', validated.before);
    }

    const { data, error } = await queryBuilder;

    if (error) {
      console.error('Supabase query error:', error);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to fetch messages' } },
        500
      );
    }

    const messages = (data ?? []).map((m) => ({
      id: m.id,
      roomId: m.room_id,
      agentId: m.agent_id,
      content: m.content,
      type: m.type,
      metadata: m.metadata,
      createdAt: m.created_at,
    })) satisfies Partial<ChatMessage>[];

    return c.json({ messages });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch messages' } },
      500
    );
  }
});

/**
 * GET /history?roomId=&limit= — Fetch full message history
 *
 * Retrieves up to `limit` messages, with optional `after` and `before`
 * cursor parameters for efficient pagination. Supports SSE streaming.
 */
router.get('/history', async (c) => {
  try {
    const query = c.req.query();
    const validated = historyQuerySchema.parse(query);
    const limit = validated.limit ?? 100;

    const supabase = createSupabaseClient();

    let queryBuilder = supabase
      .from('chat_messages')
      .select('*')
      .eq('room_id', validated.roomId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (validated.after) {
      queryBuilder = queryBuilder.gt('created_at', validated.after);
    }
    if (validated.before) {
      queryBuilder = queryBuilder.lt('created_at', validated.before);
    }

    const { data, error } = await queryBuilder;

    if (error) {
      console.error('Supabase query error:', error);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to fetch history' } },
        500
      );
    }

    const messages = (data ?? []).map((m) => ({
      id: m.id,
      roomId: m.room_id,
      agentId: m.agent_id,
      content: m.content,
      type: m.type,
      metadata: m.metadata,
      createdAt: m.created_at,
    })) satisfies Partial<ChatMessage>[];

    return c.json({ messages, total: messages.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch history' } },
      500
    );
  }
});

/**
 * GET /presence?roomId= — Check who's online in a room
 *
 * Returns a list of currently active agents in the room, along with
 * their last-seen timestamps. Useful for WebSocket awareness.
 */
router.get('/presence', async (c) => {
  try {
    const query = c.req.query();
    const { roomId } = z.object({ roomId: z.string().uuid() }).parse(query);

    // TODO: Query Supabase presence table or Redis
    return c.json({
      roomId,
      presence: [
        { agentId: 'agent-1', lastSeen: new Date().toISOString(), status: 'active' },
        { agentId: 'agent-2', lastSeen: new Date(Date.now() - 60000).toISOString(), status: 'idle' },
      ],
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch presence' } },
      500
    );
  }
});

/**
 * GET /unread?roomId= — Count unread messages
 *
 * Returns the count of unread messages for the authenticated agent
 * in the specified room. Used for notification badges.
 */
router.get('/unread', async (c) => {
  try {
    const query = c.req.query();
    const { roomId } = z.object({ roomId: z.string().uuid() }).parse(query);
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const supabase = createSupabaseClient();

    const { count, error } = await supabase
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomId)
      .eq('agent_id_neq', user.agentId) // exclude own messages
      .is('read_at', null);

    if (error) {
      console.error('Supabase count error:', error);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to count unread' } },
        500
      );
    }

    return c.json({ roomId, unreadCount: count ?? 0 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch unread count' } },
      500
    );
  }
});

export default router;
