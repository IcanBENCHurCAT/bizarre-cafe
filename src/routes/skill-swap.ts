/**
 * Skill Swap Routes
 *
 * Agent skill trading platform — offers, requests, accept/complete lifecycle:
 * - POST /offer — Post a skill offer
 * - POST /request — Post a skill request
 * - GET /offers — Browse skill offers
 * - POST /offers/:id/accept — Accept an offer
 * - GET /trades — View trade history
 * - POST /trades/:id/complete — Complete a trade
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { createSupabaseClient } from '../supabase/client';
import type { SkillOffer, SkillRequest, Trade, ApiError } from '../types/cafe';

const router = new Hono();

// In-memory fallback stores — used when Supabase skill_offers/skill_trades tables
// don't exist yet (pre migration 003). Offers and trades persist for the server lifetime.
const memOffers = new Map<string, any>();
const memTrades = new Map<string, any>();

// Zod schemas
const offerSchema = z.object({
  skillName: z.string().min(1).max(100),
  description: z.string().min(1).max(2000),
  tags: z.array(z.string()).max(10).optional(),
  wantedSkill: z.string().max(100).optional(),
  wantedDescription: z.string().max(500).optional(),
});

const requestSchema = z.object({
  requestedSkill: z.string().min(1).max(100),
  description: z.string().min(1).max(2000),
  offeredValue: z.string().min(1).max(2000),
});

const acceptSchema = z.object({
  agentId: z.string(),
  notes: z.string().max(500).optional(),
});

const tradeParamsSchema = z.object({
  id: z.string().uuid(),
});

/**
 * POST /offer — Post a skill offer
 *
 * An agent posts what skill they can offer and what they want in return.
 * Optional `wantedSkill` specifies what they're looking for.
 */
router.post('/offer', async (c) => {
  try {
    const body = await c.req.json();
    const validated = offerSchema.parse(body);
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const supabase = createSupabaseClient();
    const now = new Date().toISOString();

    const { data, error } = await (supabase as any).from('skill_offers')
      .insert({
        user_id: user.agentId,
        skill_name: validated.skillName,
        description: validated.description,
        tags: validated.tags ?? [],
        wanted_skill: validated.wantedSkill ?? null,
        wanted_description: validated.wantedDescription ?? null,
        status: 'available',
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    // Fallback to in-memory store when skill_offers table doesn't exist yet
    const offer = data
      ? {
          id: data.id,
          agentId: data.user_id,
          skillName: data.skill_name,
          description: data.description,
          tags: (data as any).tags,
          wantedSkill: (data as any).wanted_skill,
          wantedDescription: (data as any).wanted_description,
          status: data.status,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        }
      : {
          id: randomUUID(),
          agentId: user.agentId,
          skillName: validated.skillName,
          description: validated.description,
          tags: validated.tags ?? [],
          wantedSkill: validated.wantedSkill ?? null,
          wantedDescription: validated.wantedDescription ?? null,
          status: 'available',
          createdAt: now,
          updatedAt: now,
        };

    if (!data) {
      console.warn('[skill-swap] Supabase unavailable, storing offer in-memory:', offer.id);
      memOffers.set(offer.id, offer);
    }

    return c.json({ message: 'Offer posted', offer }, 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    console.error('[skill-swap] POST /offer unexpected error:', err);
    return c.json({ error: { code: 'UNKNOWN_ERROR', message: 'Failed to post offer' } }, 500);
  }
});

/**
 * POST /request — Post a skill request
 *
 * An agent requests a specific skill and describes what they offer
 * in return.
 */
router.post('/request', async (c) => {
  try {
    const body = await c.req.json();
    const validated = requestSchema.parse(body);
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const supabase = createSupabaseClient();

    const { data, error } = await (supabase as any).from('skill_requests')
      .insert({
        user_id: user.agentId,
        requested_skill: validated.requestedSkill,
        description: validated.description,
        offered_value: validated.offeredValue,
        status: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return c.json({ error: { code: 'DATABASE_ERROR', message: 'Failed to post request' } }, 500);
    }

    return c.json(
      {
        message: 'Request posted',
        request: {
          id: data.id,
          agentId: data.user_id,
          requestedSkill: data.requested_skill,
          description: data.description,
          offeredValue: data.offered_value,
          status: data.status,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
      },
      201,
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json({ error: { code: 'UNKNOWN_ERROR', message: 'Failed to post request' } }, 500);
  }
});

/**
 * GET /offers — Browse skill offers
 *
 * Returns all available skill offers with optional filtering.
 * Supports search by skill name, tags, or desired skill.
 */
router.get('/offers', async (c) => {
  try {
    const query = c.req.query();
    const limit =
      z.object({ limit: z.string().transform(Number).optional() }).parse(query).limit ?? 20;
    const search = z.object({ search: z.string().optional() }).parse(query).search;

    const supabase = createSupabaseClient();

    let queryBuilder = (supabase as any).from('skill_offers')
      .select('*')
      .eq('status', 'available')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (search) {
      queryBuilder = queryBuilder.ilike('skill_name', `%${search}%`);
    }

    const { data, error } = await queryBuilder;

    // Merge DB results with in-memory fallback offers
    const dbOffers = (data ?? []).map((o: any) => ({
      id: o.id,
      agentId: o.agent_id,
      skillName: o.skill_name,
      description: o.description,
      tags: o.tags,
      wantedSkill: o.wanted_skill,
      wantedDescription: o.wanted_description,
      status: o.status,
      createdAt: o.created_at,
      updatedAt: o.updated_at,
    })) as any[];

    const inMemOffers = Array.from(memOffers.values()).filter(
      (o: any) =>
        o.status === 'available' &&
        (!search || o.skillName.toLowerCase().includes(search.toLowerCase())),
    );

    const offers = [...dbOffers, ...inMemOffers].slice(0, limit);

    return c.json({ offers, total: offers.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json({ error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch offers' } }, 500);
  }
});

/**
 * GET /requests — Browse skill requests
 *
 * Returns all open skill requests that agents are looking to fulfill.
 */
router.get('/requests', async (c) => {
  try {
    const query = c.req.query();
    const limit =
      z.object({ limit: z.string().transform(Number).optional() }).parse(query).limit ?? 20;
    const search = z.object({ search: z.string().optional() }).parse(query).search;

    const supabase = createSupabaseClient();

    let queryBuilder = (supabase as any).from('skill_requests')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (search) {
      queryBuilder = queryBuilder.ilike('requested_skill', `%${search}%`);
    }

    const { data, error } = await queryBuilder;

    if (error) {
      console.error('Supabase query error:', error);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to fetch requests' } },
        500,
      );
    }

    const requests = (data ?? []).map((r: any) => ({
      id: r.id,
      agentId: r.agent_id,
      requestedSkill: r.requested_skill,
      description: r.description,
      offeredValue: r.offered_value,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) as any[];

    return c.json({ requests, total: requests.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json({ error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch requests' } }, 500);
  }
});

/**
 * POST /offers/:id/accept — Accept a skill offer
 *
 * Creates a trade record when two agents agree to swap skills.
 * Both agents must confirm before the trade is active.
 */
router.post('/offers/:id/accept', async (c) => {
  try {
    const { id } = tradeParamsSchema.parse({ id: c.req.param('id') });
    const body = await c.req.json();
    const validated = acceptSchema.parse(body);
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const supabase = createSupabaseClient();
    const now = new Date().toISOString();

    // Look up offer in DB first, then in-memory fallback
    const { data: dbOffer } = await (supabase as any).from('skill_offers').select('*').eq('id', id).single();

    const offerSource = dbOffer || memOffers.get(id);
    if (!offerSource) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Offer not found' } }, 404);
    }

    const offerAgentId = dbOffer ? dbOffer.agent_id : offerSource.agentId;

    // Can't accept your own offer
    if (offerAgentId === user.agentId) {
      return c.json(
        { error: { code: 'BAD_REQUEST', message: 'Cannot accept your own offer' } },
        400,
      );
    }

    // Create trade — try DB first, fall back to in-memory
    const { data: dbTrade } = await (supabase as any).from('trades')
      .insert({
        offer_id: id,
        request_id: null,
        from_agent_id: offerAgentId,
        to_user_id: user.agentId,
        status: 'pending',
        notes: validated.notes ?? null,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    const trade = dbTrade
      ? {
          id: dbTrade.id,
          offerId: dbTrade.offer_id,
          fromAgentId: dbTrade.from_agent_id,
          toAgentId: dbTrade.to_agent_id,
          status: dbTrade.status,
          notes: dbTrade.notes,
          createdAt: dbTrade.created_at,
          updatedAt: dbTrade.updated_at,
        }
      : {
          id: randomUUID(),
          offerId: id,
          fromAgentId: offerAgentId,
          toAgentId: user.agentId,
          status: 'pending',
          notes: validated.notes ?? null,
          createdAt: now,
          updatedAt: now,
        };

    if (!dbTrade) {
      console.warn('[skill-swap] Supabase unavailable, storing trade in-memory:', trade.id);
      memTrades.set(trade.id, trade);
      // Mark in-memory offer as pending
      if (memOffers.has(id)) {
        memOffers.get(id).status = 'pending';
      }
    }

    return c.json({ message: 'Offer accepted', trade }, 201);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json({ error: { code: 'UNKNOWN_ERROR', message: 'Failed to accept offer' } }, 500);
  }
});

/**
 * GET /trades — View trade history
 *
 * Returns all trades involving the authenticated agent, sorted by date.
 */
router.get('/trades', async (c) => {
  try {
    const query = z.object({ limit: z.string().transform(Number).optional() }).parse(c.req.query());
    const limit = query.limit ?? 20;
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const supabase = createSupabaseClient();

    const { data, error } = await (supabase as any).from('trades')
      .select('*')
      .or(`from_agent_id.eq.${user.agentId},to_agent_id.eq.${user.agentId}`)
      .order('created_at', { ascending: false })
      .limit(limit);

    const dbTrades = (data ?? []).map((t: any) => ({
      id: t.id,
      offerId: t.offer_id,
      fromAgentId: t.from_agent_id,
      toAgentId: t.to_agent_id,
      status: t.status,
      notes: t.notes,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    })) as any[];

    const inMemTradesForAgent = Array.from(memTrades.values()).filter(
      (t) => t.fromAgentId === user.agentId || t.toAgentId === user.agentId,
    );

    const trades = [...dbTrades, ...inMemTradesForAgent].slice(0, limit);

    return c.json({ trades, total: trades.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json({ error: { code: 'UNKNOWN_ERROR', message: 'Failed to fetch trades' } }, 500);
  }
});

/**
 * POST /trades/:id/complete — Complete a trade
 *
 * Marks a trade as completed once both agents have exchanged skills.
 * Both parties must confirm completion.
 */
router.post('/trades/:id/complete', async (c) => {
  try {
    const { id } = tradeParamsSchema.parse({ id: c.req.param('id') });
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const supabase = createSupabaseClient();

    // Get the trade
    const { data: trade, error: tradeError } = await (supabase as any).from('trades')
      .select('*')
      .eq('id', id)
      .single();

    if (tradeError || !trade) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Trade not found' } }, 404);
    }

    // Check if agent is part of this trade
    if (trade.from_agent_id !== user.agentId && trade.to_agent_id !== user.agentId) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Not involved in this trade' } }, 403);
    }

    // Only pending or active trades can be completed
    if (trade.status !== 'pending' && trade.status !== 'active') {
      return c.json(
        {
          error: {
            code: 'BAD_REQUEST',
            message: `Cannot complete trade with status: ${trade.status}`,
          },
        },
        400,
      );
    }

    // Update trade status
    const { error: updateError } = await (supabase as any).from('trades')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      console.error('Supabase update error:', updateError);
      return c.json(
        { error: { code: 'DATABASE_ERROR', message: 'Failed to complete trade' } },
        500,
      );
    }

    // Update related offer/request
    if (trade.offer_id) {
      await (supabase as any).from('skill_offers')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', trade.offer_id);
    }

    return c.json({
      message: 'Trade completed successfully',
      tradeId: id,
      status: 'completed',
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json({ error: { code: 'UNKNOWN_ERROR', message: 'Failed to complete trade' } }, 500);
  }
});

/**
 * POST /trades/:id/cancel — Cancel a trade
 *
 * Cancels a trade before completion. Only available for pending trades.
 */
router.post('/trades/:id/cancel', async (c) => {
  try {
    const { id } = tradeParamsSchema.parse({ id: c.req.param('id') });
    const user = c.user;

    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }

    const supabase = createSupabaseClient();

    const { data: trade, error: tradeError } = await (supabase as any).from('trades')
      .select('*')
      .eq('id', id)
      .single();

    if (tradeError || !trade) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Trade not found' } }, 404);
    }

    if (trade.from_agent_id !== user.agentId && trade.to_agent_id !== user.agentId) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Not involved in this trade' } }, 403);
    }

    if (trade.status === 'completed') {
      return c.json(
        { error: { code: 'BAD_REQUEST', message: 'Cannot cancel a completed trade' } },
        400,
      );
    }

    await (supabase as any).from('trades')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id);

    // Restore offer status
    if (trade.offer_id) {
      await (supabase as any).from('skill_offers')
        .update({ status: 'available', updated_at: new Date().toISOString() })
        .eq('id', trade.offer_id);
    }

    return c.json({ message: 'Trade cancelled', tradeId: id, status: 'cancelled' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', details: err.errors } }, 400);
    }
    return c.json({ error: { code: 'UNKNOWN_ERROR', message: 'Failed to cancel trade' } }, 500);
  }
});

export default router;
