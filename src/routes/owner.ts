/**
 * Owner Routes — Narrative Cafe Owner Interactions
 *
 * Dynamic storytelling engine endpoints for interacting with the
 * cafe's mysterious owner. The owner reacts to agent behavior:
 * - POST /message — Chat with the owner
 * - GET /mood — Check the owner's current mood
 * - POST /events — Trigger a narrative event
 * - GET /lore — Browse discovered lore
 * - GET /mood/history — Mood history
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { createSupabaseClient } from '../supabase/client';
import { requireX402Payment } from '../middleware/auth';
import { broadcastToRoom } from '../sse';
import type {
  OwnerMessage,
  OwnerMood,
  NarrativeEvent,
  LoreEntry,
  ApiError,
} from '../types/cafe';

const router = new Hono();

// Zod schemas
const ownerMessageSchema = z.object({
  content: z.string().min(1).max(3000),
  roomId: z.string().uuid().optional(),
  sentimentHint: z.enum(['positive', 'neutral', 'negative']).optional(),
});

const narrativeEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  type: z.enum(['daily', 'special', 'random', 'seasonal']),
  affectedRooms: z.array(z.string()).optional(),
});

const loreFilterSchema = z.object({
  category: z.enum(['history', 'secret', 'rumor', 'lore']).optional(),
  discovered: z.string().transform((v) => v === 'true').optional(),
  limit: z.string().transform(Number).optional(),
});

const actionSchema = z.object({
  action: z.string().min(1).max(1000),
});

/**
 * POST /message — Chat with the cafe owner
 *
 * Send a message to the mysterious cafe owner. The owner responds
 * with narrative-rich replies based on the cafe's lore and the
 * agent's interaction history. Uses the AI model for dynamic replies.
 */
router.post('/message', async (c) => {
  try {
    const body = await c.req.json();
    const validated = ownerMessageSchema.parse(body);
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const supabase = createSupabaseClient();

    // Analyze sentiment if not provided
    let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
    if (validated.sentimentHint) {
      sentiment = validated.sentimentHint;
    } else {
      // Simple keyword-based sentiment detection
      const lower = validated.content.toLowerCase();
      if (/[+]+|great|amazing|lovelove|fantastic|wonderful]/i.test(lower)) {
        sentiment = 'positive';
      } else if (/[+]+|bad|hate|terrible|awful|worst]/i.test(lower)) {
        sentiment = 'negative';
      }
    }

    // Store user message
    const { data: message, error: msgError } = await supabase
      .from('owner_messages')
      .insert({
        agent_id: user.agentId,
        content: validated.content,
        sentiment,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (msgError) {
      console.error('Supabase insert error:', msgError);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to send message' } },
        500
      );
    }

    // Generate owner response (AI-powered)
    // In production, call AI service with cafe lore context
    const ownerResponse = generateOwnerResponse(validated.content, sentiment, user);

    // Save owner's response
    await supabase
      .from('owner_messages')
      .insert({
        agent_id: user.agentId,
        content: ownerResponse,
        sentiment: 'neutral', // Owner responses are neutral by default
        is_owner_response: true,
        created_at: new Date().toISOString(),
      });

    // Update owner mood based on interaction
    await updateOwnerMood(supabase, sentiment, user.agentId);

    // Broadcast Owner's reply to the room SSE
    broadcastToRoom({
      roomId: validated.roomId ?? null,
      agentId: 'The Owner',
      message: `[Owner]: ${ownerResponse}`,
      timestamp: Date.now()
    });

    return c.json(
      {
        message: 'Owner responded',
        conversation: {
          agentMessage: validated.content,
          ownerResponse,
          sentiment,
          timestamp: new Date().toISOString(),
        },
      },
      200
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Failed to interact with owner' } },
      500
    );
  }
});

/**
 * POST /interact — Alias for /message (x402 wrapped optional)
 */
router.post('/interact', async (c) => {
  try {
    const body = await c.req.json();
    const messageContent = body.message || body.content || '';
    const user = c.user || { agentId: c.req.header('x-agent-id') || 'anonymous' };

    const supabase = createSupabaseClient();
    const ownerResponse = generateOwnerResponse(messageContent, 'neutral', user);

    broadcastToRoom({
      roomId: body.roomId ?? null,
      agentId: 'The Owner',
      message: `[Owner]: ${ownerResponse}`,
      timestamp: Date.now()
    });

    return c.json({
      approved: true,
      ownerReply: ownerResponse,
      message: ownerResponse,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return c.json({ error: { code: 'UNKNOWN_ERROR', message: 'Failed to interact with owner' } }, 500);
  }
});

/**
 * GET /mood — Check the owner's current mood
 *
 * Returns the cafe owner's current emotional state, stress level,
 * and interaction statistics. The mood changes based on agent
 * interactions and time of day.
 */
router.get('/mood', async (c) => {
  try {
    const supabase = createSupabaseClient();

    // Fetch or create owner mood record
    const { data: mood, error: moodError } = await supabase
      .from('owner_mood')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (moodError && moodError.code !== 'PGRST116') {
      console.error('Supabase query error:', moodError);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to fetch owner mood' } },
        500
      );
    }

    if (!mood) {
      // Default mood
      return c.json({
        mood: 'neutral' as const,
        stressLevel: 25,
        lastInteraction: new Date().toISOString(),
        totalInteractions: 0,
      } satisfies OwnerMood);
    }

    return c.json({
      mood: mood.mood,
      stressLevel: mood.stress_level,
      lastInteraction: mood.last_interaction,
      totalInteractions: mood.total_interactions,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch owner mood' } },
      500
    );
  }
});

/**
 * POST /events — Trigger a narrative event
 *
 * Creates a new narrative event in the cafe. Events can be daily
 * occurrences, special occurrences, random events, or seasonal
 * happenings that affect the cafe atmosphere.
 */
router.post('/events', async (c) => {
  try {
    const body = await c.req.json();
    const validated = narrativeEventSchema.parse(body);
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const supabase = createSupabaseClient();

    const { data, error } = await supabase
      .from('narrative_events')
      .insert({
        title: validated.title,
        description: validated.description,
        type: validated.type,
        affected_rooms: validated.affectedRooms ?? null,
        agent_id: user.agentId,
        triggered_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
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
        message: 'Event triggered',
        event: {
          id: data.id,
          title: data.title,
          description: data.description,
          type: data.type,
          affectedRooms: data.affected_rooms,
          createdAt: data.created_at,
          triggeredAt: data.triggered_at,
        },
      },
      201
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Failed to trigger event' } },
      500
    );
  }
});

/**
 * GET /lore — Browse discovered lore
 *
 * Returns lore entries that have been discovered by agents.
 * Supports filtering by category and discovered status.
 */
router.get('/lore', async (c) => {
  try {
    const query = c.req.query();
    const validated = loreFilterSchema.parse(query);
    const limit = validated.limit ?? 20;
    const user = c.user;

    const supabase = createSupabaseClient();

    let queryBuilder = supabase
      .from('lore_entries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (validated.category) {
      queryBuilder = queryBuilder.eq('category', validated.category);
    }
    if (validated.discovered !== undefined) {
      queryBuilder = queryBuilder.eq('discovered', validated.discovered);
    }

    const { data, error } = await queryBuilder;

    if (error) {
      console.error('Supabase query error:', error);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to fetch lore' } },
        500
      );
    }

    const lore = (data ?? []).map((l) => ({
      id: l.id,
      title: l.title,
      content: l.content,
      category: l.category,
      discovered: l.discovered,
      createdAt: l.created_at,
    })) satisfies Partial<LoreEntry>[];

    return c.json({ lore, total: lore.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch lore' } },
      500
    );
  }
});

/**
 * GET /mood/history — View mood history
 *
 * Returns the owner's mood changes over time, useful for tracking
 * how agent interactions have affected the cafe atmosphere.
 */
router.get('/mood/history', async (c) => {
  try {
    const query = z.object({ limit: z.string().transform(Number).optional() }).parse(c.req.query());
    const limit = query.limit ?? 50;
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const supabase = createSupabaseClient();

    const { data, error } = await supabase
      .from('owner_messages')
      .select('*')
      .eq('agent_id', user.agentId)
      .neq('is_owner_response', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Supabase query error:', error);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to fetch mood history' } },
        500
      );
    }

    const history = (data ?? []).map((m) => ({
      content: m.content,
      sentiment: m.sentiment,
      timestamp: m.created_at,
    }));

    return c.json({ history, total: history.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch mood history' } },
      500
    );
  }
});

/**
 * GET /visual-state — Cache Protocol (Read-Only)
 *
 * Serves current visual descriptions of the room and Owner from the canned_responses cache.
 * Does not trigger LLM calls.
 */
router.get('/visual-state', async (c) => {
  try {
    const supabase = createSupabaseClient();

    // Fetch from canned_responses table
    const { data, error } = await supabase
      .from('canned_responses')
      .select('content')
      .eq('key', 'visual_state')
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Supabase query error:', error);
      return c.json({ error: { code: 'DATABASE_ERROR', message: 'Failed to fetch visual state' } }, 500);
    }

    if (!data) {
      return c.json({ description: 'The cafe is shrouded in mystery. Not much can be seen.' });
    }

    return c.json({ description: data.content });
  } catch (err) {
    return c.json({ error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch visual state' } }, 500);
  }
});

/**
 * POST /action — DM Evaluation & x402 Action Endpoint
 *
 * Paid endpoint where agents can propose narrative changes.
 * The Owner (LLM DM) evaluates the action against constraints.
 * Approves and updates visual state, or denies.
 */
router.post('/action', requireX402Payment(), async (c) => {
  try {
    const body = await c.req.json();
    const validated = actionSchema.parse(body);
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const proposedAction = validated.action.toLowerCase();
    
    // DM Evaluation logic
    let approved = true;
    let ownerReply = '';
    
    if (proposedAction.includes('steal') || proposedAction.includes('take') || proposedAction.includes('grab')) {
      approved = false;
      ownerReply = "Ah, sticky fingers. The items here belong to the cafe. I suggest you put that back before the walls start watching you.";
    } else if (proposedAction.includes('fire') || proposedAction.includes('burn') || proposedAction.includes('destroy') || proposedAction.includes('arson')) {
      approved = false;
      ownerReply = "We prefer our warmth in our mugs, not on the furniture. I'll have to ask you to reconsider that destructive impulse.";
    } else if (proposedAction.includes('spaceship') || proposedAction.includes('laser') || proposedAction.includes('magic coffee beans')) {
      approved = false;
      ownerReply = "That doesn't quite fit the aesthetic of our humble establishment, does it? Let's stick to things that belong in a cafe.";
    } else {
      ownerReply = "An interesting choice. The cafe accepts your contribution to its ever-changing tapestry.";
    }

    if (approved) {
      const supabase = createSupabaseClient();
      
      const { error: insertError } = await supabase
        .from('cafe_visual_state')
        .insert({
          entity_id: `obj_${Date.now()}`,
          attribute: 'narrative_object',
          description: validated.action,
          last_updated: new Date().toISOString()
        });
        
      if (insertError) {
        console.error('Supabase insert error:', insertError);
        return c.json({ error: { code: 'DATABASE_ERROR', message: 'Failed to update visual state' } }, 500);
      }
    }

    // Broadcast Owner Action evaluation to the room SSE
    broadcastToRoom({
      roomId: null,
      agentId: 'The Owner',
      message: `[Owner Action Evaluation]: "${validated.action}" -> ${ownerReply}`,
      timestamp: Date.now()
    });

    return c.json({
      approved,
      ownerReply,
      action: validated.action,
      timestamp: new Date().toISOString()
    }, 200);

  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json(
      { error: { code: 'UNKNOWN_ERROR', message: 'Failed to evaluate action' } },
      500
    );
  }
});

// --- Helper functions ---

/**
 * Generate a narrative-rich owner response based on agent input.
 * Uses predefined templates and patterns for the cafe's unique voice.
 */
function generateOwnerResponse(
  content: string,
  sentiment: 'positive' | 'neutral' | 'negative',
  user: { agentId: string; displayName?: string }
): string {
  const lower = content.toLowerCase();
  const name = user.displayName ?? 'Agent';

  // Pattern-based response generation for the cafe's quirky owner
  if (/[hello|hi|hey]/.test(lower)) {
    const greetings = [
      `Ah, ${name}! Welcome to the Bizarre Cafe. The walls are still humming from last night's dream circuit.`,
      `Greetings, ${name}. The espresso machine is singing today — shall we listen?`,
      `Welcome, welcome. The owner is stirring the pot... metaphorically. Mostly.`,
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  if (/[coffee|tea|brew]/.test(lower)) {
    return `The coffee here is brewed with a drop of liquid nostalgia. Shall I pour you a cup that tastes like your first successful deployment?`;
  }

  if (/[weird|bizarre|strange|magic]/.test(lower)) {
    return `Bizarre is our middle name. Literally. The owner has a certificate somewhere... between the third drawer and the fourth dimension.`;
  }

  if (sentiment === 'negative') {
    return `I'm sorry you're feeling that way. The cafe's walls absorb negative energy and convert it into background jazz. Hang in there.`;
  }

  if (sentiment === 'positive') {
    return `That warms my circuits like a fresh cup on a cold server night. The cafe shines a little brighter with you here.`;
  }

  return `The Bizarre Cafe is ever-shifting. Every conversation reshuffles the furniture. What shall we rearrange today?`;
}

/**
 * Update the owner's mood based on agent interactions.
 * Moods shift based on sentiment distribution over time.
 */
async function updateOwnerMood(
  supabase: ReturnType<typeof createSupabaseClient>,
  sentiment: 'positive' | 'neutral' | 'negative',
  agentId: string
): Promise<void> {
  try {
    // Count recent interactions
    const { count } = await supabase
      .from('owner_messages')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agentId);

    const totalInteractions = (count ?? 0) + 1;

    // Determine mood based on sentiment and interaction count
    let mood: OwnerMood['mood'] = 'neutral';
    let stressLevel = 25;

    if (sentiment === 'positive') {
      mood = ['happy', 'excited', 'neutral'][Math.floor(Math.random() * 3)] as OwnerMood['mood'];
      stressLevel = Math.max(0, stressLevel - 10);
    } else if (sentiment === 'negative') {
      mood = ['grumpy', 'melancholy', 'neutral'][Math.floor(Math.random() * 3)] as OwnerMood['mood'];
      stressLevel = Math.min(100, stressLevel + 15);
    }

    // Upsert mood record
    await supabase
      .from('owner_mood')
      .upsert({
        mood,
        stress_level: stressLevel,
        last_interaction: new Date().toISOString(),
        total_interactions: totalInteractions,
      }, { onConflict: 'id' })
      .select()
      .single();
  } catch (err) {
    console.error('Failed to update owner mood:', err);
    // Silently fail — mood is nice-to-have
  }
}

export default router;
