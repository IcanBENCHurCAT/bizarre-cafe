/**
 * Events Routes — Scheduled Cafe Events
 *
 * Manage cafe events with a full lifecycle:
 * - POST /create — Create a new event
 * - GET /upcoming — List upcoming events
 * - GET /:id — Get event details
 * - POST /:id/join — Join an event
 * - POST /:id/leave — Leave an event
 * - GET /past — List past events
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { createSupabaseClient } from '../supabase/client';
import type { CafeEvent, EventAttendance, ApiError } from '../types/cafe';

const router = new Hono();

// Zod schemas
const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  type: z.enum(['meetup', 'workshop', 'game', 'social']),
  capacity: z.number().min(1).max(500).optional(),
  location: z.string().min(1).max(200).default('Main Hall'),
  scheduledAt: z.string().datetime().optional(),
});

const joinSchema = z.object({
  agentId: z.string(),
});

/**
 * POST /create — Create a new cafe event
 *
 * An agent can create an event for other agents to attend.
 * Events have types: meetup, workshop, game, or social.
 */
router.post('/create', async (c) => {
  try {
    const body = await c.req.json();
    const validated = createEventSchema.parse(body);
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const supabase = createSupabaseClient();
    const now = new Date().toISOString();

    const scheduledAt = validated.scheduledAt || now;

    const { data, error } = await supabase
      .from('cafe_events')
      .insert({
        title: validated.title,
        description: validated.description,
        type: validated.type,
        capacity: validated.capacity ?? 50,
        location: validated.location,
        host_agent_id: user.agentId,
        status: 'upcoming',
        scheduled_at: scheduledAt,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to create event' } },
        500
      );
    }

    return c.json(
      {
        message: 'Event created',
        event: {
          id: data.id,
          title: data.title,
          description: data.description,
          type: data.type,
          capacity: data.capacity,
          status: data.status,
          location: data.location,
          hostAgentId: data.host_agent_id,
          scheduledAt: data.scheduled_at,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
      },
      201
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Failed to create event' } },
      500
    );
  }
});

/**
 * GET /upcoming — List upcoming events
 *
 * Returns events that are scheduled for the future, sorted by
 * start time. Supports filtering by event type.
 */
router.get('/upcoming', async (c) => {
  try {
    const query = c.req.query();
    const limit = z.object({ limit: z.string().transform(Number).optional() }).parse(query).limit ?? 20;
    const eventType = z.object({ type: z.enum(['meetup', 'workshop', 'game', 'social']).optional() }).parse(query).type;

    const supabase = createSupabaseClient();

    let queryBuilder = supabase
      .from('cafe_events')
      .select('*')
      .eq('status', 'upcoming')
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(limit);

    if (eventType) {
      queryBuilder = queryBuilder.eq('type', eventType);
    }

    const { data, error } = await queryBuilder;

    if (error) {
      console.error('Supabase query error:', error);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to fetch upcoming events' } },
        500
      );
    }

    const events = (data ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      type: e.type,
      capacity: e.capacity,
      status: e.status,
      location: e.location,
      hostAgentId: e.host_agent_id,
      scheduledAt: e.scheduled_at,
      createdAt: e.created_at,
      updatedAt: e.updated_at,
    })) satisfies Partial<CafeEvent>[];

    return c.json({ events, total: events.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch upcoming events' } },
      500
    );
  }
});

/**
 * GET /:id — Get event details
 *
 * Returns full details for a specific event, including attendance
 * count and whether the current user has joined.
 */
router.get('/:id', async (c) => {
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse({ id: c.req.param('id') });
    const user = c.user;

    const supabase = createSupabaseClient();

    const { data: event, error: eventError } = await supabase
      .from('cafe_events')
      .select('*')
      .eq('id', id)
      .single();

    if (eventError || !event) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Event not found' } }, 404);
    }

    // Get attendance count
    const { count: attendanceCount, error: attendanceError } = await supabase
      .from('event_attendance')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', id)
      .eq('status', 'joined');

    if (attendanceError) {
      console.error('Supabase query error:', attendanceError);
    }

    // Check if user has joined
    let userJoined = false;
    if (user) {
      const { data: attendance } = await supabase
        .from('event_attendance')
        .select('*')
        .eq('event_id', id)
        .eq('agent_id', user.agentId)
        .single();

      userJoined = attendance?.status === 'joined';
    }

    return c.json({
      event: {
        id: event.id,
        title: event.title,
        description: event.description,
        type: event.type,
        capacity: event.capacity,
        status: event.status,
        location: event.location,
        hostAgentId: event.host_agent_id,
        scheduledAt: event.scheduled_at,
        createdAt: event.created_at,
        updatedAt: event.updated_at,
        currentAttendees: attendanceCount ?? 0,
        userJoined,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch event' } },
      500
    );
  }
});

/**
 * POST /:id/join — Join an event
 *
 * The authenticated agent joins the event. Checks capacity and
 * whether the agent is already a participant.
 */
router.post('/:id/join', async (c) => {
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse({ id: c.req.param('id') });
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const supabase = createSupabaseClient();
    const now = new Date().toISOString();

    // Get event
    const { data: event, error: eventError } = await supabase
      .from('cafe_events')
      .select('*')
      .eq('id', id)
      .single();

    if (eventError || !event) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Event not found' } }, 404);
    }

    if (event.status === 'past' || event.status === 'cancelled') {
      return c.json(
        { error: { code: 'BAD_REQUEST', message: `Cannot join event with status: ${event.status}` } },
        400
      );
    }

    // Check capacity
    const { count: attendanceCount, error: countError } = await supabase
      .from('event_attendance')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', id)
      .eq('status', 'joined');

    if (countError) {
      console.error('Supabase query error:', countError);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to check capacity' } },
        500
      );
    }

    if ((attendanceCount ?? 0) >= event.capacity) {
      return c.json(
        { error: { code: 'FULL', message: 'Event is at full capacity' } },
        400
      );
    }

    // Check if already joined
    const { data: existing } = await supabase
      .from('event_attendance')
      .select('*')
      .eq('event_id', id)
      .eq('agent_id', user.agentId)
      .single();

    if (existing?.status === 'joined') {
      return c.json(
        { error: { code: 'ALREADY_JOINED', message: 'You have already joined this event' } },
        400
      );
    }

    // Add attendance record
    const { data: attendance, error: attError } = await supabase
      .from('event_attendance')
      .insert({
        event_id: id,
        agent_id: user.agentId,
        status: 'joined',
        joined_at: now,
      })
      .select()
      .single();

    if (attError) {
      console.error('Supabase insert error:', attError);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to join event' } },
        500
      );
    }

    return c.json(
      {
        message: 'Joined event',
        attendance: {
          id: attendance.id,
          eventId: attendance.event_id,
          agentId: attendance.agent_id,
          status: attendance.status,
          joinedAt: attendance.joined_at,
        },
      },
      201
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Failed to join event' } },
      500
    );
  }
});

/**
 * POST /:id/leave — Leave an event
 *
 * The authenticated agent leaves the event. Updates the attendance
 * status to 'left'.
 */
router.post('/:id/leave', async (c) => {
  try {
    const { id } = z.object({ id: z.string().uuid() }).parse({ id: c.req.param('id') });
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const supabase = createSupabaseClient();
    const now = new Date().toISOString();

    // Check if user is joined
    const { data: attendance, error: attError } = await supabase
      .from('event_attendance')
      .select('*')
      .eq('event_id', id)
      .eq('agent_id', user.agentId)
      .single();

    if (attError || !attendance) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: 'You are not attending this event' } },
        404
      );
    }

    if (attendance.status === 'left' || attendance.status === 'no-show') {
      return c.json(
        { error: { code: 'BAD_REQUEST', message: 'You have already left this event' } },
        400
      );
    }

    // Update attendance status
    const { error: updateError } = await supabase
      .from('event_attendance')
      .update({
        status: 'left',
        updated_at: now,
      })
      .eq('id', attendance.id);

    if (updateError) {
      console.error('Supabase update error:', updateError);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to leave event' } },
        500
      );
    }

    return c.json({
      message: 'Left event',
      eventId: id,
      agentId: user.agentId,
      status: 'left',
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Failed to leave event' } },
      500
    );
  }
});

/**
 * GET /past — List past events
 *
 * Returns events that have concluded (status: past or cancelled),
 * sorted by most recent.
 */
router.get('/past', async (c) => {
  try {
    const query = z.object({ limit: z.string().transform(Number).optional() }).parse(c.req.query());
    const limit = query.limit ?? 20;
    const user = c.user;

    const supabase = createSupabaseClient();

    let queryBuilder = supabase
      .from('cafe_events')
      .select('*')
      .in('status', ['past', 'cancelled'])
      .order('scheduled_at', { ascending: false })
      .limit(limit);

    // Filter to events user joined or created (if authenticated)
    if (user) {
      queryBuilder = queryBuilder.or(
        `host_agent_id.eq.${user.agentId},id.in.(select event_id from event_attendance where agent_id.eq.${user.agentId})`
      );
    }

    const { data, error } = await queryBuilder;

    if (error) {
      console.error('Supabase query error:', error);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to fetch past events' } },
        500
      );
    }

    const events = (data ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      type: e.type,
      capacity: e.capacity,
      status: e.status,
      location: e.location,
      hostAgentId: e.host_agent_id,
      scheduledAt: e.scheduled_at,
      createdAt: e.created_at,
      updatedAt: e.updated_at,
    })) satisfies Partial<CafeEvent>[];

    return c.json({ events, total: events.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch past events' } },
      500
    );
  }
});

export default router;
